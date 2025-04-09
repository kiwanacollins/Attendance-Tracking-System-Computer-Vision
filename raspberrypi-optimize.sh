#!/bin/bash
# Raspberry Pi 4B Optimization Script for Attendance Tracking System

echo "===== Raspberry Pi 4B Performance Optimization ====="

# 1. Check current memory usage and temperature
echo "Current Memory Usage:"
free -h
echo 

echo "Current CPU Temperature:"
vcgencmd measure_temp
echo

# 2. Set up swap space (as a backup)
echo "Setting up swap space..."
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
echo "Swap configured to 1GB"
echo

# 3. Optimize GPU memory split (ideal for TensorFlow.js)
echo "Optimizing GPU memory allocation..."
if grep -q "gpu_mem=" /boot/config.txt; then
  sudo sed -i 's/gpu_mem=.*/gpu_mem=128/' /boot/config.txt
else
  echo "gpu_mem=128" | sudo tee -a /boot/config.txt
fi
echo "Set GPU memory to 128MB"
echo

# 4. Set CPU governor to performance mode
echo "Setting CPU governor to performance mode..."
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
echo "CPU governor set to performance mode"
echo

# 5. Disable unnecessary services
echo "Disabling unnecessary services..."
sudo systemctl disable bluetooth.service
sudo systemctl stop bluetooth.service
echo "Bluetooth services disabled"
echo

# 6. Clear browser cache
echo "Clearing browser cache..."
rm -rf ~/.cache/chromium/*
rm -rf ~/.config/chromium/Default/Cache/*
echo "Browser cache cleared"
echo

echo "===== Optimization Complete ====="
echo "Please reboot your Raspberry Pi with 'sudo reboot'"
