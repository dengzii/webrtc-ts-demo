import React, { useRef } from 'react';
import logo from './logo.svg';
import './App.css';
import { testWebRTC, WebRTC } from './webrtc/webrtc';


function App() {

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const videoTargetRef = useRef<HTMLVideoElement | null>(null);
	const [started, setStarted] = React.useState(false);

	const webRtc = new WebRTC();

	const onCallClick = () => {
		webRtc.call("").then((stream) => {
			videoRef.current!.srcObject = stream;
		});
	}

	const onAnswerClick = () => {
		const offer = prompt("Enter Offer");
		webRtc.mockAnswer(offer!).then((stream) => {
			videoTargetRef.current!.srcObject = stream;
		});
	}

	return (
		<div className="App">
			<header className="App-header">
				<button onClick={onCallClick}>Call</button>
				<button onClick={onAnswerClick}>Answer</button>
				<div style={{ width: "900px", height: "400px" }}>
					<video ref={videoRef} width="400" height="400" controls style={{ float: "left" }} />

					<video ref={videoTargetRef} width="400" height="400" controls style={{ float: "right" }} />
				</div>
			</header >
		</div >
	);
}

export default App;
