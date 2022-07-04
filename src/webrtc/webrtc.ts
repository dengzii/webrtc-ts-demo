import { off } from "process";
import { isCommaListExpression } from "typescript";
import { Call, Dialing, Incomming, WsDialing } from "./dialing";
import { Peer } from "./peer";
import { Signaling, WsSignaling } from "./signaling";

let iceServer: RTCIceServer[] = [
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
    },
    {
        urls: 'stun:stun.l.google.com:19302',
    },
]

export function setIceServer(iceServer: RTCIceServer[]) {
    iceServer = iceServer;
}

export async function testWebRTC(s: (stream: MediaStream) => void): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    connectionPeer(stream, s);
    return stream;
}

function connectionPeer(stream: MediaStream, s: (stream: MediaStream) => void) {
    const rtcPeerConnectionConfig: RTCConfiguration = {
        iceServers: iceServer,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
    };
    const myPeerConnection = new RTCPeerConnection(rtcPeerConnectionConfig);
    const thierPeerConnection = new RTCPeerConnection(rtcPeerConnectionConfig);

    myPeerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            console.log('icecandidate event: ', event.candidate);
            thierPeerConnection.addIceCandidate(event.candidate);
        }
    }

    thierPeerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            myPeerConnection.addIceCandidate(event.candidate);
        }
    }
    thierPeerConnection.ontrack = function (event) {
        s(event.streams[0]);
    }

    stream.getTracks().forEach(function (track) {
        myPeerConnection.addTrack(track, stream);
    });

    myPeerConnection.createOffer().then(function (offer) {
        console.log('createOffer', offer.sdp);
        myPeerConnection.setLocalDescription(offer);
        thierPeerConnection.setRemoteDescription(offer);

        thierPeerConnection.createAnswer().then(function (answer) {
            thierPeerConnection.setLocalDescription(answer);
            myPeerConnection.setRemoteDescription(answer);
        })
    })
}

export class WebRTC {

    private localStream: MediaStream | null = null;
    private peers = new Map<string, RTCPeerConnection>();
    private rtcPeerConnectionConfig: RTCConfiguration = {};

    private peer: Peer | null = null;
    private signaling: Signaling

    onIncoming: ((peerId: string, incoming: Incomming) => void) = () => { }
    onLocalStreamChanged: ((stream: MediaStream | null) => void) = () => { }
    onRemoteStreamChanged: ((stream: MediaStream | null) => void) = () => { }

    constructor(signling: Signaling) {
        this.rtcPeerConnectionConfig = {
            iceServers: iceServer,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
        };
        this.signaling = signling;
        this.init();
    }

    private init() {
        this.signaling.onIncomming = (peerId: string, incoming: Incomming) => {

            this.onIncoming(peerId, {
                peerInfo: incoming.peerInfo,
                accept: () => {
                    this.peer = Peer.create(peerId, this.rtcPeerConnectionConfig, this.signaling);
                    this.initPeer();
                    return incoming.accept();
                },
                reject: incoming.reject,
                onCancel: incoming.onCancel,
            });
        }

        this.signaling.onOffer = (offerPeerId: string, offer: RTCSessionDescriptionInit) => {
            if (offerPeerId === this.peer?.peerId) {
                this.peer?.sendAnswer(offer);
            }
        }

        this.signaling.onAnswer = (answerPeerId: string, answer: RTCSessionDescriptionInit) => {
            if (answerPeerId === this.peer?.peerId) {
                this.peer?.onAnswer(answer);
            }
        }
    }

    call(peerId: string): Promise<Dialing> {
        if (!this.signaling.avaliable()) {
            return Promise.reject("Signaling not avaliable");
        }

        const dialing = new WsDialing(peerId, this.signaling as WsSignaling);

        this.peer = Peer.create(peerId, this.rtcPeerConnectionConfig, this.signaling);
        this.initPeer();

        this.attachLocalStream();

        return dialing.dial().then(() => {
            const wrap: Dialing = {
                peerId: peerId,
                cancel: () => {
                    this.close()
                    return dialing.cancel();
                },
                onFail: (err: string) => { },
                onAccept: (call: Call) => { },
                onReject: () => { },
            }
            dialing.onFail = (reason: string) => {
                this.close()
                wrap.onFail(reason);
            }
            dialing.onAccept = (call: Call) => {
                this.peer?.sendOffer();
                wrap.onAccept(call);
            }
            dialing.onReject = () => {
                this.close()
                wrap.onReject();
            }
            return wrap;
        });
    }

    close() {
        this.onLocalStreamChanged(null);
        this.localStream = null;
        this.peer?.close();
        this.peer = null;
    }


    private attachLocalStream() {
        if (this.localStream != null && this.localStream.active) {
            this.peer?.addStream(this.localStream);
        } else {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    this.onLocalStreamChanged(stream);
                    this.localStream = stream;
                    this.peer?.addStream(stream);
                })
                .catch(err => {
                    console.error(err);
                })
        }
    }

    private initPeer() {
        this.peer!!.onTrack = (stream: ReadonlyArray<MediaStream>) => {
            this.onRemoteStreamChanged(stream[0]);
        }
    }
}
