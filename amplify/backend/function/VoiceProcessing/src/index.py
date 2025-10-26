"""
Lambda function for handling voice-to-text and text-to-voice requests
Deploy this as an Amplify Lambda function
"""
import json
import boto3
import base64
import time

polly = boto3.client('polly')
transcribe = boto3.client('transcribe')
s3 = boto3.client('s3')

# Update with your S3 bucket name
S3_BUCKET = 'team-34-inrix-hackathon'

def handler(event, context):
    """
    Main Lambda handler
    Supports both text-to-speech and speech-to-text
    """
    print('Received event:', json.dumps(event))

    try:
        # Parse request
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        operation = body.get('operation')  # 'text-to-speech' or 'speech-to-text'

        if operation == 'text-to-speech':
            result = handle_text_to_speech(body)
        elif operation == 'speech-to-text':
            result = handle_speech_to_text(body)
        else:
            return create_response(400, {'error': 'Invalid operation. Use "text-to-speech" or "speech-to-text"'})

        return create_response(200, result)

    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': str(e)})

def handle_text_to_speech(body):
    """
    Convert text to speech using Amazon Polly

    Request body:
    {
        "operation": "text-to-speech",
        "text": "Hello world",
        "voice_id": "Joanna" (optional)
    }
    """
    text = body.get('text')
    voice_id = body.get('voice_id', 'Joanna')

    if not text:
        raise ValueError('Text is required for text-to-speech')

    # Generate speech
    response = polly.synthesize_speech(
        Text=text,
        OutputFormat='mp3',
        VoiceId=voice_id,
        Engine='neural'
    )

    # Read audio stream and encode to base64
    audio_data = response['AudioStream'].read()
    audio_base64 = base64.b64encode(audio_data).decode('utf-8')

    return {
        'audio': audio_base64,
        'format': 'mp3',
        'voice': voice_id,
        'text': text
    }

def handle_speech_to_text(body):
    """
    Convert speech to text using Amazon Transcribe

    Request body:
    {
        "operation": "speech-to-text",
        "audio": "base64_encoded_audio_data",
        "language_code": "en-US" (optional)
    }
    """
    audio_base64 = body.get('audio')
    language_code = body.get('language_code', 'en-US')

    if not audio_base64:
        raise ValueError('Audio data is required for speech-to-text')

    # Decode audio
    if 'base64,' in audio_base64:
        audio_base64 = audio_base64.split('base64,')[1]

    audio_bytes = base64.b64decode(audio_base64)

    # Upload to S3
    job_name = f"transcribe-{int(time.time())}"
    s3_key = f"audio-uploads/{job_name}.mp3"

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=audio_bytes,
        ContentType='audio/mpeg'
    )

    audio_uri = f"s3://{S3_BUCKET}/{s3_key}"

    # Start transcription job
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': audio_uri},
        MediaFormat='mp3',
        LanguageCode=language_code
    )

    # Wait for job to complete (with timeout)
    max_wait = 60  # seconds
    start_time = time.time()

    while time.time() - start_time < max_wait:
        status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        job_status = status['TranscriptionJob']['TranscriptionJobStatus']

        if job_status == 'COMPLETED':
            # Get transcript
            transcript_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']

            # Fetch transcript
            import urllib.request
            with urllib.request.urlopen(transcript_uri) as response:
                data = json.loads(response.read())
                transcript = data['results']['transcripts'][0]['transcript']

            return {
                'transcript': transcript,
                'language_code': language_code,
                'job_name': job_name
            }

        elif job_status == 'FAILED':
            error = status['TranscriptionJob'].get('FailureReason', 'Unknown error')
            raise Exception(f"Transcription failed: {error}")

        time.sleep(2)

    raise Exception("Transcription timed out")

def create_response(status_code, body):
    """Create API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        'body': json.dumps(body)
    }

# For local testing
if __name__ == "__main__":
    # Test text-to-speech
    test_event = {
        'body': json.dumps({
            'operation': 'text-to-speech',
            'text': 'Hello, this is a test of the voice system'
        })
    }

    result = handler(test_event, None)
    print(json.dumps(result, indent=2))
