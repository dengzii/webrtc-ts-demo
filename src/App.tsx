import React, { useEffect, useRef } from 'react';
import './App.css';
import { Dialing, Dialog, Incomming } from './webrtc/dialing';
import { mLog, setLogCb } from './webrtc/log';
import { WsSignaling } from './webrtc/signaling';
import { rtcConfig, setRtcConfig, WebRTC } from './webrtc/webrtc';

interface AppConfig {
	signalingUrl: string;
	rtcConfig: RTCConfiguration;
}

const defaultConfig: AppConfig = {
	signalingUrl: 'wss://ws.glide-im.pro/ws',
	rtcConfig: rtcConfig
}


function App() {

	const [config, setConfig] = React.useState<AppConfig>(defaultConfig);

	const applyConfig = (newConfig: AppConfig) => {
		setConfig(newConfig);
		setRtcConfig(newConfig.rtcConfig);
	}

	return <div className="App">
		<header className="App-header">
			{config === null
				? <Configure default={config} callback={applyConfig} />
				: <>
					<WebRtcDemo ws={config.signalingUrl} />
					<Logger /></>
			}
		</header>
	</div>;
}

function Configure(props: { default: any, callback: (config: AppConfig) => void }) {

	const textRef = useRef<HTMLTextAreaElement | null>(null);


	const onApply = () => {
		const config = JSON.parse(textRef.current!.value);
		props.callback(config);
	}

	return <>
		<p>请输入配置信息</p>
		<textarea ref={textRef} defaultValue={JSON.stringify(props.default)} style={{ width: "400px", height: "300px" }} />
		<button onClick={onApply}>应用</button>
	</>
}

function Logger() {
	const [log, setLog] = React.useState<string[]>([])

	useEffect(() => {
		setLogCb(l => {
			setLog([l, ...log]);
		})
	}, [log])

	return < textarea style={{ width: "400px", height: "200px", wordBreak: "keep-all" }} defaultValue={log.join("\n")} />
}

function WebRtcDemo(props: { ws: string }) {

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const videoTargetRef = useRef<HTMLVideoElement | null>(null);
	const friendIdRef = useRef<HTMLInputElement | null>(null);
	const yourIdRef = useRef<HTMLInputElement | null>(null);

	const [hello, setHello] = React.useState(false);
	const [updateFriendId, setUpdateFriendId] = React.useState(false);

	const [incomming, setIncomming] = React.useState<Incomming | null>(null);
	const [dialing, setDialing] = React.useState<Dialing | null>(null);
	const [call, setCall] = React.useState<Dialog | null>(null);

	const [rtcState, setRtcState] = React.useState<"idle" | "calling" | "incoming" | "connected">("idle");

	const signaling = React.useMemo(() => new WsSignaling(props.ws), [props.ws]);

	const webRTC = React.useMemo(() => new WebRTC(signaling), [signaling]);

	useEffect(() => {
		webRTC.onIncoming = (peerId: string, i: Incomming) => {
			i.peer.onTrack = (track: RTCTrackEvent) => {
				videoTargetRef.current!.srcObject = track.streams[0];
				videoTargetRef.current!.play()
			}

			i.onCancel = () => {
				setIncomming(null);
				setRtcState("idle");
			}
			setIncomming(i);
			setRtcState("incoming");
		}
		webRTC.onLocalStreamChanged = (stream: MediaStream | null) => {
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				if (stream !== null) {
					videoRef.current.play();
				} else {
					videoRef.current.pause();
				}
			}
		}
	}, [webRTC])

	useEffect(() => {
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

	const handleDialog = (dialog: Dialog) => {
		dialog.onHangup = () => {
			videoRef.current?.pause()
			videoTargetRef.current?.pause()
			videoRef.current!.srcObject = null;
			videoTargetRef.current!.srcObject = null;
			setRtcState("idle");
		}
		setCall(dialog);
		setRtcState("connected");
	}

	const onBtnClick = () => {
		switch (rtcState) {
			case "idle":
				webRTC.call(friendIdRef.current!.value)
					.then((dialing) => {

						dialing.peer.onTrack = (track: RTCTrackEvent) => {
							videoTargetRef.current!.srcObject = track.streams[0];
							videoTargetRef.current!.load()
						}

						setDialing(dialing);
						setRtcState("calling");
						dialing.onFail = (msg) => {
							alert(msg);
						}
						dialing.onReject = () => {
							setRtcState("idle");
						}
						dialing.onAccept = (c: Dialog) => {
							handleDialog(c);
						}
						if (dialing.peer.localStream !== null) {
							videoRef.current!.srcObject = dialing.peer.localStream;
							videoRef.current!.play();
						}
					}).catch((err) => {
						alert(err);
					});
				break;
			case "calling":
				dialing?.cancel().then(() => {
					videoRef.current!.pause();
					videoRef.current!.srcObject = null;
					setDialing(null);
					setRtcState("idle");
				});
				break;
			case "incoming":
				incomming?.accept().then((call) => {
					videoRef.current!.srcObject = call.peer.localStream;
					videoRef.current!.play();
					handleDialog(call);
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

	return (<>
		<div style={{ width: "410px", height: "200px" }}>
			<video ref={videoRef} width="200" height="200" controls style={{ float: "left" }} />
			<video ref={videoTargetRef} width="200" height="200" controls style={{ float: "right" }} />
		</div>
		<div>
			<small>Your ID: </small> <input type="text" ref={yourIdRef} /><br />
			<small>Friend ID: </small> <input type="text" ref={friendIdRef} /> {updateFriendId ? <small>Updated</small> : <></>} <br />
			<button onClick={onBtnClick}>{btnText}</button>
			{rtcState === "incoming" ? <button onClick={onRejectClick}>Reject</button> : <></>}

			<button onClick={onSayHelloClick}>Say Hello</button> {hello ? <small>Replyied</small> : <></>}<br />
		</div>
	</>
	);
}

export default App;
