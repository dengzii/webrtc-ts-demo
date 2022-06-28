import React, { useEffect, useRef } from 'react';
import logo from './logo.svg';
import './App.css';
import { testWebRTC, WebRTC } from './webrtc/webrtc';
import { Signling } from './webrtc/signaling';


function App() {

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const videoTargetRef = useRef<HTMLVideoElement | null>(null);
	const signalingRef = useRef<HTMLInputElement | null>(null);
	const friendIdRef = useRef<HTMLInputElement | null>(null);
	const yourIdRef = useRef<HTMLInputElement | null>(null);

	const [log, setLog] = React.useState<string[]>([])

	const [signalingUrl, setSignalingUrl] = React.useState("ws://localhost:8080/ws");
	const [hello, setHello] = React.useState(false);
	const [updateFriendId, setUpdateFriendId] = React.useState(false);

	const signaling = React.useMemo(() => new Signling(signalingUrl), [signalingUrl]);
	const webRtc = React.useMemo(() => new WebRTC(), []);

	useEffect(() => {
		console.log("init signaling");
		signaling.logCallback = (l: string) => {
			setLog([...log, l]);
		}
		signaling.setIdCallback((id: string) => {
			yourIdRef.current!.value = id;
		})
		signaling.onHelloCallback = (id: string, replay: boolean) => {
			if (replay) {
				setHello(true);
				setTimeout(() => {
					setHello(false)
				}, 1000);
			} else {
				setUpdateFriendId(true);
				setTimeout(() => {
					setUpdateFriendId(false)
				}, 1000);
				friendIdRef.current!.value = id
			}
		}
		return () => {
			signaling.close()
		}
	}, [signaling]);

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

	const onConnectClick = () => {
		setSignalingUrl(signalingRef.current!.value);
	}

	const onSayHelloClick = () => {
		const to = friendIdRef.current!.value
		signaling.helloToFriend(to)
	}

	return (
		<div className="App">
			<header className="App-header">
				<div style={{ width: "410px", height: "200px" }}>
					<video ref={videoRef} width="200" height="200" controls style={{ float: "left" }} />
					<video ref={videoTargetRef} width="200" height="200" controls style={{ float: "right" }} />
				</div>
				<div>
					<small>Signling Server: </small><input type="text" ref={signalingRef} value={signalingUrl} /><button onClick={onConnectClick}>connect</button><br />
					<small>Your ID: </small> <input type="text" ref={yourIdRef} /><br />
					<small>Friend ID: </small> <input type="text" ref={friendIdRef} /> {updateFriendId ? <small>Updated</small> : <></>} <br />
					<button onClick={onSayHelloClick}>Say Hello</button> {hello ? <small>Replyied</small> : <></>} <button onClick={onCallClick}>Call</button>
					<button style={{ fontWeight: "bold" }}>Incoming, Click Anwser</button><br />
					<textarea style={{ width: "400px", height: "200px", wordBreak: "keep-all" }} defaultValue={log.join("\n")} />
				</div>
			</header >
		</div >
	);
}

export default App;
