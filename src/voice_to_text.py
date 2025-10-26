import boto3
import time
import json

# Initialize AWS services
transcribe = boto3.client('transcribe', region_name='us-east-1')
s3 = boto3.client('s3', region_name='us-east-1')

def transcribe_audio_file(audio_file_path, job_name=None):
    """
    Transcribe audio file using Amazon Transcribe
    Supports: mp3, mp4, wav, flac, ogg, amr, webm
    """
    if job_name is None:
        job_name = f"transcribe-job-{int(time.time())}"

    # For local files, you need to upload to S3 first
    bucket_name = 'your-bucket-name'  # Replace with your S3 bucket
    s3_key = f"audio-uploads/{job_name}.mp3"

    try:
        # Upload file to S3
        print(f"Uploading {audio_file_path} to S3...")
        s3.upload_file(audio_file_path, bucket_name, s3_key)
        audio_uri = f"s3://{bucket_name}/{s3_key}"

        # Start transcription job
        print(f"Starting transcription job: {job_name}")
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': audio_uri},
            MediaFormat='mp3',
            LanguageCode='en-US'
        )

        # Wait for job to complete
        while True:
            status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
            job_status = status['TranscriptionJob']['TranscriptionJobStatus']

            if job_status in ['COMPLETED', 'FAILED']:
                break

            print(f"Transcription in progress... Status: {job_status}")
            time.sleep(2)

        if job_status == 'COMPLETED':
            # Get the transcript
            transcript_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']
            transcript_text = get_transcript_text(transcript_uri)
            print(f"\nTranscript: {transcript_text}")
            return transcript_text
        else:
            print(f"Transcription failed: {status['TranscriptionJob']['FailureReason']}")
            return None

    except Exception as e:
        print(f"Error: {e}")
        return None

def get_transcript_text(transcript_uri):
    """Extract text from transcript JSON"""
    import urllib.request
    with urllib.request.urlopen(transcript_uri) as response:
        data = json.loads(response.read())
        return data['results']['transcripts'][0]['transcript']

def transcribe_streaming(audio_stream):
    """
    Real-time transcription for streaming audio
    More suitable for live voice input
    """
    # This requires additional setup with streaming API
    # See: https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
    pass

# Test the function
if __name__ == "__main__":
    # Example: Transcribe an audio file
    audio_file = "test_audio.mp3"  # Replace with your audio file
    result = transcribe_audio_file(audio_file)

    if result:
        print(f"\nFinal transcript: {result}")
