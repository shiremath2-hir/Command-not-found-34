import boto3
import time
import json
import os

# Initialize AWS services
polly = boto3.client('polly', region_name='us-east-1')
transcribe = boto3.client('transcribe', region_name='us-east-1')
s3 = boto3.client('s3', region_name='us-east-1')

# Configuration
S3_BUCKET = 'team-34-inrix-hackathon'  # Replace with your S3 bucket name

# ============ TEXT-TO-SPEECH (Polly) ============

def text_to_speech(text, output_file='output.mp3', voice_id='Joanna'):
    """
    Convert text to speech using Amazon Polly

    Args:
        text: Text to convert to speech
        output_file: Output file name
        voice_id: Voice to use (Joanna, Matthew, Amy, etc.)
    """
    try:
        response = polly.synthesize_speech(
            Text=text,
            OutputFormat='mp3',
            VoiceId=voice_id,
            Engine='neural'  # Neural voices sound more natural
        )

        # Save audio file
        with open(output_file, 'wb') as file:
            file.write(response['AudioStream'].read())

        print(f"Audio saved as {output_file}")
        return output_file

    except Exception as e:
        print(f"Error in text_to_speech: {e}")
        return None

def play_audio(file_path):
    """Play audio file on macOS"""
    os.system(f'afplay {file_path}')

# ============ SPEECH-TO-TEXT (Transcribe) ============

def speech_to_text(audio_file, language_code='en-US'):
    """
    Convert speech to text using Amazon Transcribe

    Args:
        audio_file: Path to audio file (mp3, wav, flac, etc.)
        language_code: Language code (en-US, es-ES, etc.)
    """
    job_name = f"transcribe-{int(time.time())}"
    s3_key = f"audio-uploads/{job_name}.mp3"

    try:
        # Upload to S3
        print(f"Uploading {audio_file} to S3...")
        s3.upload_file(audio_file, S3_BUCKET, s3_key)
        audio_uri = f"s3://{S3_BUCKET}/{s3_key}"

        # Start transcription
        print("Starting transcription...")
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': audio_uri},
            MediaFormat='mp3',
            LanguageCode=language_code
        )

        # Wait for completion
        while True:
            status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
            job_status = status['TranscriptionJob']['TranscriptionJobStatus']

            if job_status in ['COMPLETED', 'FAILED']:
                break

            print("Transcription in progress...")
            time.sleep(2)

        if job_status == 'COMPLETED':
            # Get transcript
            transcript_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']
            import urllib.request
            with urllib.request.urlopen(transcript_uri) as response:
                data = json.loads(response.read())
                transcript = data['results']['transcripts'][0]['transcript']

            print(f"Transcript: {transcript}")
            return transcript
        else:
            error = status['TranscriptionJob'].get('FailureReason', 'Unknown error')
            print(f"Transcription failed: {error}")
            return None

    except Exception as e:
        print(f"Error in speech_to_text: {e}")
        return None

# ============ COMPLETE VOICE ASSISTANT ============

def voice_conversation():
    """
    Complete voice assistant that listens and responds
    1. User speaks (record audio)
    2. Convert speech to text
    3. Process the text (you can add AI here)
    4. Convert response to speech
    5. Play the audio response
    """
    print("\n=== Voice Assistant Demo ===\n")

    # Simulate user input (replace with actual audio recording)
    user_audio = "user_input.mp3"  # You'll need to record this

    # 1. Convert user's speech to text
    print("1. Converting your speech to text...")
    user_text = speech_to_text(user_audio)

    if not user_text:
        print("Could not understand audio")
        return

    print(f"You said: {user_text}")

    # 2. Process the text (add your logic here)
    # For example, integrate with your navigation AI
    response_text = process_user_command(user_text)

    # 3. Convert response to speech
    print("3. Converting response to speech...")
    response_audio = text_to_speech(response_text)

    # 4. Play the response
    print("4. Playing response...")
    play_audio(response_audio)

def process_user_command(text):
    """
    Process user command and generate response
    Integrate this with your navigation/image recognition logic
    """
    text_lower = text.lower()

    if 'navigate' in text_lower or 'directions' in text_lower:
        return "Sure! Where would you like to go?"
    elif 'traffic' in text_lower:
        return "Checking traffic conditions along your route."
    elif 'what do you see' in text_lower or 'describe' in text_lower:
        return "I see a crosswalk ahead. There are cars on your right."
    else:
        return f"I heard you say: {text}. How can I help you?"

# ============ QUICK TEST FUNCTIONS ============

def test_text_to_speech():
    """Test text-to-speech only"""
    print("\n=== Testing Text-to-Speech ===")
    text = "Hello! I am your navigation assistant. I will help you navigate safely."
    audio_file = text_to_speech(text)
    if audio_file:
        play_audio(audio_file)

def test_speech_to_text():
    """Test speech-to-text only"""
    print("\n=== Testing Speech-to-Text ===")
    audio_file = "test_audio.mp3"  # Replace with your audio file
    if os.path.exists(audio_file):
        transcript = speech_to_text(audio_file)
        print(f"Transcript: {transcript}")
    else:
        print(f"Audio file not found: {audio_file}")

# ============ MAIN ============

if __name__ == "__main__":
    # Test text-to-speech (this works immediately)
    test_text_to_speech()

    # Test speech-to-text (requires audio file and S3 bucket)
    # test_speech_to_text()

    # Full voice conversation (requires setup)
    # voice_conversation()
