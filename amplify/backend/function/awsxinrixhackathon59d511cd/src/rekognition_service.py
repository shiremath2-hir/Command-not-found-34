"""
Rekognition Service Module
- Encapsulates all interactions with the AWS Rekognition API.
- Initializes the boto3 client.
- Provides a simple function to analyze an image.
"""
import boto3

# Initialize the client once when the module is loaded.
# This is more efficient for Lambda execution contexts.
try:
    rekognition = boto3.client('rekognition')
except Exception as e:
    print(f"Error initializing Boto3 client: {e}")
    rekognition = None

def analyze_image(image_bytes):
    """
    Analyzes an image using Rekognition for labels and text.
    
    Args:
        image_bytes (bytes): The raw bytes of the image to analyze.

    Returns:
        tuple: A (labels_response, text_response) tuple.
    """
    if not rekognition:
        raise Exception("Rekognition client is not initialized.")

    # 1. Detect labels (objects, scenes, concepts)
    labels_response = rekognition.detect_labels(
        Image={'Bytes': image_bytes},
        MaxLabels=10,
        MinConfidence=70
    )
    
    # 2. Detect text in image
    text_response = rekognition.detect_text(
        Image={'Bytes': image_bytes}
    )
    
    return labels_response, text_response