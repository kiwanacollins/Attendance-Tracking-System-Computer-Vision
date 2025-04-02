#!/bin/bash
# Attendance Tracking System Deployment Script for Raspberry Pi
# This script installs and configures all necessary components 

set -e

INSTALL_DIR="/home/pi/attendance-tracking"
REPO_URL="https://github.com/yourusername/attendance-tracking-system.git"

echo "===== Attendance Tracking System Deployment Script ====="
echo "This script will set up the people counting system on your Raspberry Pi."
echo

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install dependencies
echo "Installing dependencies..."
apt-get install -y nodejs npm nginx sqlite3 git python3-opencv

# Create installation directory
echo "Creating installation directory..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/frontend"
mkdir -p "$INSTALL_DIR/backend"
mkdir -p "$INSTALL_DIR/backend/data"
mkdir -p "$INSTALL_DIR/backend/logs"
chown -R pi:pi "$INSTALL_DIR"

# Clone project (or copy from local directory)
if [ -d "./project" ]; then
  echo "Copying local project files..."
  cp -r ./project/backend/* "$INSTALL_DIR/backend/"
  cp -r ./project/dist/* "$INSTALL_DIR/frontend/"
else
  echo "Cloning repository..."
  git clone "$REPO_URL" "$INSTALL_DIR/temp"
  cp -r "$INSTALL_DIR/temp/project/backend/"* "$INSTALL_DIR/backend/"
  cp -r "$INSTALL_DIR/temp/project/dist/"* "$INSTALL_DIR/frontend/"
  rm -rf "$INSTALL_DIR/temp"
fi

# Install backend dependencies
echo "Installing backend dependencies..."
cd "$INSTALL_DIR/backend"
npm install --production

# Configure systemd service
echo "Setting up systemd service..."
cp "$INSTALL_DIR/backend/attendance-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable attendance-api
systemctl start attendance-api

# Configure Nginx
echo "Setting up Nginx web server..."
cp "$INSTALL_DIR/backend/nginx-raspberry-pi.conf" /etc/nginx/sites-available/attendance-tracking
ln -sf /etc/nginx/sites-available/attendance-tracking /etc/nginx/sites-enabled/
systemctl restart nginx

# Enable camera
echo "Enabling Raspberry Pi camera..."
if ! grep -q "start_x=1" /boot/config.txt; then
  echo "start_x=1" >> /boot/config.txt
  echo "gpu_mem=128" >> /boot/config.txt
fi

# Performance optimizations
echo "Applying Raspberry Pi performance optimizations..."

# Disable unnecessary services
systemctl disable bluetooth.service
systemctl stop bluetooth.service

# Disable swap for longer SD card life
dphys-swapfile swapoff
dphys-swapfile uninstall
systemctl disable dphys-swapfile

# Set CPU governor to conservative for better power efficiency
echo "conservative" | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Create information file with IP address for easy access
IPADDR=$(hostname -I | awk '{print $1}')
cat > "$INSTALL_DIR/ACCESS_INFO.txt" << EOF
==============================================
Attendance Tracking System has been installed!
==============================================

To access the application:
- Web interface: http://$IPADDR
- API endpoint: http://$IPADDR/api

Folders:
- Frontend: $INSTALL_DIR/frontend
- Backend: $INSTALL_DIR/backend
- Database: $INSTALL_DIR/backend/data
- Logs: $INSTALL_DIR/backend/logs

Services:
- Backend API: systemctl status attendance-api
- Web Server: systemctl status nginx

==============================================
EOF

# Set permissions
chown -R pi:pi "$INSTALL_DIR"

echo
echo "Installation complete!"
echo "The system is accessible at: http://$IPADDR"
echo "See $INSTALL_DIR/ACCESS_INFO.txt for more details"
echo
echo "System will reboot in 10 seconds to apply all changes..."
sleep 10
reboot