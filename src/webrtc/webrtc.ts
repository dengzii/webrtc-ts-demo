import { off } from "process";
import { Call, Dialing, WsDialing } from "./dialing";
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
    private remoteStream: ReadonlyArray<MediaStream> | null = null;
    private peerConnection: RTCPeerConnection;
    private rtcPeerConnectionConfig: RTCConfiguration = {};

    private signaling: Signaling

    onOfferIncoming: (peerId: string, answer: () => Promise<void>) => void = () => { };
    onAnswered: (peerId: string) => void = () => { };

    constructor(signling: Signaling) {
        this.rtcPeerConnectionConfig = {
            iceServers: iceServer,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
        };
        this.signaling = signling;
        this.peerConnection = new RTCPeerConnection(this.rtcPeerConnectionConfig);
        this.init();
    }

    private init() {
        this.peerConnection.onnegotiationneeded = () => {
            console.log('onnegotiationneeded');
        };
        this.peerConnection.onsignalingstatechange = () => {
            console.log('Signaling state changed to: ' + this.peerConnection!.signalingState);
        }
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state changed to: ' + this.peerConnection!.connectionState);
        };
        this.peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate) {
                console.log('icecandidate event: ', event.candidate);
                this.peerConnection.addIceCandidate(event.candidate).catch(error => {
                    console.log('Error adding candidate: ' + error);
                });
            }
        };
        this.peerConnection.ontrack = (event: RTCTrackEvent) => {
            this.remoteStream = event.streams;
            event.track.onunmute = () => {
                console.log('remote track unmuted');
            }
            event.track.onmute = () => {
                console.log('remote track muted');
            }
            event.track.onended = () => {
                console.log('remote track ended');
            }
            console.log('ontrack', event.track);
        };

        this.signaling.onOffer = (offerPeerId: string, offer: RTCSessionDescriptionInit) => {
            this.onOffer(offerPeerId, offer);
        }

        this.signaling.onAnswer = (answerPeerId: string, answer: RTCSessionDescriptionInit) => {
            this.onAnswer(answerPeerId, answer);
        }
    }

    call(peerId: string): Promise<Dialing | null> {
        if (!this.signaling.avaliable()) {
            return Promise.reject("Signaling not avaliable");
        }

        return this.getLocalMediaStream()
            .then((stream) => {
                if (stream === null) {
                    return null;
                }
                this.localStream = stream;
                stream.getTracks().forEach(track => {
                    this.peerConnection!.addTrack(track);
                });
                return stream;
            }).then((stream) => {
                this.peerConnection.createOffer().then(offer => {
                    this.peerConnection.setLocalDescription(offer);
                    this.signaling.sendOffer(peerId, offer);
                });
                return new WsDialing(peerId, this.signaling as WsSignaling);
            }).catch(error => {
                console.error('Error getting local media stream', error);
                return null;
            });
    }

    close() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
    }

    stopLocalMediaStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    private onOffer(offerPeerId: string, offer: RTCSessionDescriptionInit) {
        console.log('Received offer from ' + offerPeerId);


        const answer: () => Promise<void> = async () => {

            this.peerConnection!.setRemoteDescription(offer);

            const answer = await this.peerConnection!.createAnswer();
            this.peerConnection!.setLocalDescription(answer);
            this.signaling.sendAnswer(offerPeerId, answer);
        }
        this.onOfferIncoming(offerPeerId, answer);
    }

    private onAnswer(answerPeerId: string, answer: RTCSessionDescriptionInit) {
        console.log('Received answer from ' + answerPeerId);
        this.peerConnection!.setRemoteDescription(answer).catch(error => {
            console.error('Error setting remote description', error);
        });
        this.onAnswered(answerPeerId);
    }

    async getLocalMediaStream() {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }

}
