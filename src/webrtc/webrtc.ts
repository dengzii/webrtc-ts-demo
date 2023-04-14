import { Dialing, Incoming, PeerInfo, WsDialing } from "./dialing";
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

    myPeerConnection.createOffer().then(async function (offer) {
        console.log('createOffer', offer.sdp);
        await myPeerConnection.setLocalDescription(offer);
        await thierPeerConnection.setRemoteDescription(offer);

        return thierPeerConnection.createAnswer().then(function (answer) {
            thierPeerConnection.setLocalDescription(answer);
            myPeerConnection.setRemoteDescription(answer);
        })
    })
}

export class WebRTC {

    private readonly signaling: Signaling

    onIncoming: ((peerId: string, incoming: Incoming) => void) = () => { }
    onRemoteStreamChanged: ((stream: MediaStream | null) => void) = () => { }

    constructor(signaling: Signaling) {
        this.signaling = signaling;
        this.init();
    }

    private init() {
        this.signaling.onIncoming = (peerInfo: PeerInfo, incoming: Incoming) => {
            this.onIncoming(peerInfo.id, incoming);
        }
    }

    call(peerId: string): Promise<Dialing> {
        if (!this.signaling.available()) {
            return Promise.reject("Signaling not available");
        }

        const dialing = new WsDialing(peerId, this.signaling as WsSignaling);
        return dialing.dial();
    }
}
