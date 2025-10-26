# Team 34 - AI Navigation Assistant

AWS x INRIX Hackathon Project

## What it does

An accessible navigation app that helps users navigate safely using voice commands and AI-powered image recognition.

**Features:**
- Voice-to-text for hands-free commands (Amazon Transcribe)
- Text-to-speech for navigation directions (Amazon Polly)
- Real-time image recognition to detect obstacles (Amazon Rekognition)
- Turn-by-turn navigation with traffic updates (AWS Location + INRIX)

## Tech Stack

- AWS Amplify
- AWS Lambda (Python)
- Amazon Polly - text-to-speech
- Amazon Transcribe - speech-to-text
- Amazon Rekognition - image recognition
- AWS Location Service
- INRIX Traffic API

## Setup

1. Clone the repo
```bash
git clone https://github.com/shiremath2-hir/Command-not-found-34.git
cd Command-not-found-34
```

2. Pull Amplify backend
```bash
amplify pull
```

3. Install dependencies
```bash
pip3 install boto3
```

4. Test it out
```bash
python3 src/test_polly.py
```

## Project Structure

```
├── amplify/backend/function/
│   ├── VoiceProcessing/       # Voice-to-text and text-to-voice
│   ├── NavigationAI/          # Navigation and routing logic
│   └── awsxinrixhackathon*/   # Image recognition
├── src/
│   ├── complete_voice_assistant.py
│   ├── voice_to_text.py
│   └── test_polly.py
└── index.html                 # Frontend
```

## Team Members

Team 34

## How to Use

1. Open the app
2. Speak a command like "Where is the nearest coffee shop?"
3. The app transcribes your voice, processes the request, and speaks back directions
4. Camera detects obstacles in real-time and warns you

## Demo

[Add demo video/screenshots here]
