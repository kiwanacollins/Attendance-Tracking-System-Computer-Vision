#!/bin/bash
# Raspberry Pi Performance Optimization Script for TensorFlow.js applications

echo "Applying Raspberry Pi optimizations for TensorFlow.js..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Increase GPU memory allocation for better WebGL performance
echo "Increasing GPU memory allocation..."
if grep -q "gpu_mem=" /boot/config.txt; then
  # Update existing setting
  sed -i 's/gpu_mem=.*/gpu_mem=128/g' /boot/config.txt
else
  # Add setting if it doesn't exist
  echo "gpu_mem=128" >> /boot/config.txt
fi

# Disable screen blanking for kiosk-mode applications
echo "Disabling screen blanking..."
if [ -f /etc/xdg/lxsession/LXDE-pi/autostart ]; then
  if ! grep -q "@xset s off" /etc/xdg/lxsession/LXDE-pi/autostart; then
    echo "@xset s off" >> /etc/xdg/lxsession/LXDE-pi/autostart
    echo "@xset -dpms" >> /etc/xdg/lxsession/LXDE-pi/autostart
    echo "@xset s noblank" >> /etc/xdg/lxsession/LXDE-pi/autostart
  fi
fi

# Optimize browser settings for TensorFlow.js
echo "Optimizing browser settings..."
cat > /etc/chromium-browser/default << EOF
# Optimized Chromium flags for TensorFlow.js on Raspberry Pi
CHROMIUM_FLAGS="--disable-gpu-driver-bug-workarounds --ignore-gpu-blacklist --enable-webgl --enable-accelerated-canvas --disable-quic --disable-features=IsolateOrigins --disable-site-isolation-trials --enable-features=VaapiVideoDecoder"
EOF

# Set CPU governor to performance mode
echo "Setting CPU governor to performance mode..."
if command -v cpufreq-set &> /dev/null; then
  for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    cpufreq-set -c ${cpu##*/} -g performance
  done
fi

# Optimize Node.js for better TensorFlow.js performance
echo "Optimizing Node.js memory settings..."
echo 'export NODE_OPTIONS="--max-old-space-size=512"' > /etc/profile.d/node-memory.sh

echo "Raspberry Pi performance optimizations complete!"
echo "Please reboot your system for all changes to take effect."
