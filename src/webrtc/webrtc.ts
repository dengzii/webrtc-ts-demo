import { Dialing, Incomming, PeerInfo, WsDialing } from "./dialing";
import { Peer } from "./peer";
import { Signaling, WsSignaling } from "./signaling";

export let iceServer: RTCIceServer[] = [
    {
        urls: "stun:openrelay.metered.ca:80",
      },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
]

export let rtcConfig: RTCConfiguration = {
    iceServers: iceServer,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-compat',
    rtcpMuxPolicy: 'require',
};

export function setRtcConfig(c: RTCConfiguration) {
    rtcConfig = c;
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

    private peer: Peer | null = null;
    private signaling: Signaling

    onIncoming: ((peerId: string, incoming: Incomming) => void) = () => { }
    onLocalStreamChanged: ((stream: MediaStream | null) => void) = () => { }
    onRemoteStreamChanged: ((stream: MediaStream | null) => void) = () => { }

    constructor(signling: Signaling) {
        this.signaling = signling;
        this.init();
    }

    private init() {
        this.signaling.onIncomming = (peerInfo: PeerInfo, incoming: Incomming) => {
            this.onIncoming(peerInfo.id, incoming);
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
        return dialing.dial();
    }
}
