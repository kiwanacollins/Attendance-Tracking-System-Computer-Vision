#!/bin/bash

# Install optimized TensorFlow.js models for Raspberry Pi
echo "Installing optimized TensorFlow.js models for person detection on Raspberry Pi..."

# Ensure node and npm are available
if ! command -v npm &> /dev/null; then
    echo "Error: npm is required but not installed."
    exit 1
fi

# Install the specialized face detection model (BlazeFace)
echo "Installing @tensorflow-models/blazeface..."
npm install --save @tensorflow-models/blazeface@0.1.0

# Install MobileNet as an alternative
echo "Installing @tensorflow-models/mobilenet..."
npm install --save @tensorflow-models/mobilenet@2.1.1

# Make sure we still have the original COCO-SSD model as a fallback
echo "Ensuring @tensorflow-models/coco-ssd is installed..."
npm install --save @tensorflow-models/coco-ssd@2.2.3

echo "All model dependencies installed successfully."
echo "The system will now use BlazeFace by default, which is optimized for Raspberry Pi."
echo "To try a different model, change the DETECTION_MODEL constant in LiveFeed.tsx."
