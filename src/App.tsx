import React, { useEffect, useRef } from 'react';
import './App.css';
import { Call, Dialing, Incomming } from './webrtc/dialing';
import { WsSignaling } from './webrtc/signaling';
import { WebRTC } from './webrtc/webrtc';


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

	const [incomming, setIncomming] = React.useState<Incomming | null>(null);
	const [dialing, setDialing] = React.useState<Dialing | null>(null);
	const [call, setCall] = React.useState<Call | null>(null);

	const [rtcState, setRtcState] = React.useState<"idle" | "calling" | "incoming" | "connected">("idle");

	const signaling = React.useMemo(() => new WsSignaling(signalingUrl), [signalingUrl]);

	const webRTC = React.useMemo(() => new WebRTC(signaling), [signaling]);

	useEffect(() => {
		signaling.onIncomming = (peerId: string, i: Incomming) => {
			i.onCancel = () => {
				setIncomming(null);
				setRtcState("idle");
			}
			setIncomming(i);
			setRtcState("incoming");
		}
	}, [webRTC])

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

	const onBtnClick = () => {
		switch (rtcState) {
			case "idle":
				signaling.dialing(friendIdRef.current!.value)
					.then((dialing) => {
						setDialing(dialing);
						setRtcState("calling");
						dialing.onFail = (msg) => {
							alert(msg);
						}
						dialing.onReject = () => {
							setRtcState("idle");
						}
						dialing.onAccept = (c: Call) => {
							c.onHangup = () => {
								setRtcState("idle");
							}
							setCall(c);
							setRtcState("connected");
						}
					}).catch((err) => {
						alert(err);
					});
				break;
			case "calling":
				dialing?.cancel().then(() => {
					setDialing(null);
					setRtcState("idle");
				});
				break;
			case "incoming":
				incomming?.accept().then((call) => {
					setCall(call);
					call.onHangup = () => {
						setRtcState("idle");
					}
					setRtcState("connected");
				}).catch(e => {
					setRtcState("idle");
					alert("error" + e);
				})
				break;
			case "connected":
				call?.hangup().then(() => {
					setRtcState("idle");
				});
				break;
		}
	}

	const onConnectClick = () => {
		setSignalingUrl(signalingRef.current!.value);
	}

	const onSayHelloClick = () => {
		const to = friendIdRef.current!.value
		signaling.helloToFriend(to)
	}

	const onRejectClick = () => {
		incomming?.reject().then(() => {
			setIncomming(null);
		}).catch(e => {
			alert("error" + e);
		}).finally(() => {
			setRtcState("idle");
		}
		)
	}

	let btnText = "";
	switch (rtcState) {
		case "idle":
			btnText = "Dial";
			break;
		case "calling":
			btnText = "Cancel";
			break;
		case "incoming":
			btnText = "Answer";
			break;
		case "connected":
			btnText = "Hangup";
			break;
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
					<button onClick={onBtnClick}>{btnText}</button>
					{rtcState === "incoming" ? <button onClick={onRejectClick}>Reject</button> : <></>}

					<button onClick={onSayHelloClick}>Say Hello</button> {hello ? <small>Replyied</small> : <></>}<br />
					<textarea style={{ width: "400px", height: "200px", wordBreak: "keep-all" }} defaultValue={log.join("\n")} />
				</div>
			</header >
		</div >
	);
}

export default App;
