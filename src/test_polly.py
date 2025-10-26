import boto3
import os

# Initialize Polly client
polly = boto3.client('polly', region_name='us-east-1')

def text_to_speech(text):
    """Convert text to speech"""
    try:
        response = polly.synthesize_speech(
            Text=text,
            OutputFormat='mp3',
            VoiceId='Joanna',
            Engine='neural'
        )
        
        # Save audio file
        with open('output.mp3', 'wb') as file:
            file.write(response['AudioStream'].read())
        
        print("✓ Audio saved as output.mp3")
        
        # Play the audio (macOS)
        os.system('afplay output.mp3')
        
    except Exception as e:
        print(f"Error: {e}")

# Test it
text_to_speech("Hello! I am your navigation assistant. I will help you navigate safely.")