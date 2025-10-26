import React, { useEffect, useRef } from 'react';

const VoiceController = ({ isListening, onToggle, onCommand }) => {
const recognitionRef = useRef(null);

useEffect(() => {
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
recognitionRef.current = new SpeechRecognition();
recognitionRef.current.continuous = true;
recognitionRef.current.interimResults = false;
recognitionRef.current.lang = 'en-US';
recognitionRef.current.onresult = (event) => {
const last = event.results[event.results.length - 1];
const command = last[0].transcript.toLowerCase().trim();
onCommand(command);
};
recognitionRef.current.onerror = () => onToggle(false);
recognitionRef.current.onend = () => {
if (isListening) {
try { recognitionRef.current.start(); } catch (err) {}
}
};
}
}, [isListening, onCommand, onToggle]);

useEffect(() => {
if (!recognitionRef.current) return;
if (isListening) {
try { recognitionRef.current.start(); } catch (err) {}
} else {
recognitionRef.current.stop();
}
}, [isListening]);

return null;
};

export default VoiceController;