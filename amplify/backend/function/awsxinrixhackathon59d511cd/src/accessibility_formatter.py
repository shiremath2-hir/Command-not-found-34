"""
Accessibility Formatter Module
- Contains logic for generating human-readable descriptions
  from raw Rekognition API responses.
- Has no external dependencies (like boto3).
"""

def generate_description(labels_response, text_response):
    """
    Generate a human-readable description for accessibility purposes.
    
    Args:
        labels_response (dict): The raw JSON response from detect_labels.
        text_response (dict): The raw JSON response from detect_text.

    Returns:
        str: A formatted string for text-to-speech.
    """
    description_parts = []
    
    # 1. Process labels
    if labels_response and labels_response.get('Labels'):
        # Get the 'Name' from the top 3 label objects
        top_labels = [label['Name'] for label in labels_response['Labels'][:3]]
        if top_labels:
            description_parts.append(f"I see: {', '.join(top_labels)}")
    
    # 2. Process text
    if text_response and text_response.get('TextDetections'):
        # Filter for text 'Type' == 'LINE' and get the detected text
        text_items = [t['DetectedText'] for t in text_response['TextDetections']
                      if t.get('Type') == 'LINE']
        if text_items:
            # Join the first 3 lines of text
            description_parts.append(f"Text found: {'. '.join(text_items[:3])}")
    
    # 3. Combine parts
    if not description_parts:
        return "Unable to detect clear objects or text in this image."
        
    return '. '.join(description_parts)