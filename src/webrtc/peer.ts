import { Call, Dialing, WsDialing } from "./dialing";
import { Signaling, WsSignaling } from "./signaling";

export class Peer {

    private peerConnection: RTCPeerConnection;
    private remoteStream: ReadonlyArray<MediaStream> | null = null;
    private signaling: Signaling;
    peerId: string

    onTrack: (stream: ReadonlyArray<MediaStream>) => void = () => { };

    private constructor(peerId: string, private config: RTCConfiguration, signaling: Signaling) {
        this.signaling = signaling;
        this.peerId = peerId;
        this.peerConnection = new RTCPeerConnection(config);
    }

    public static create(peerId: string, config: RTCConfiguration, signaling: Signaling): Peer {
        const peer = new Peer(peerId, config, signaling);
        peer.init();
        return peer;
    }

    public init() {
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
            this.onTrack(event.streams);

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
    }

    public close() {

    }

    public onAnswer(answer: RTCSessionDescriptionInit) {
        this.peerConnection!.setRemoteDescription(answer).catch(error => {
            console.error('Error setting remote description', error);
        });
    }

    public sendAnswer(offer: RTCSessionDescriptionInit) {
        this.peerConnection!.setRemoteDescription(offer);
        this.peerConnection!.createAnswer().then(answer => {
            this.peerConnection!.setLocalDescription(answer);
            this.signaling.sendAnswer(this.peerId, answer);
        });
    }

    public sendOffer() {
        this.peerConnection.createOffer();
        this.peerConnection.createOffer().then(offer => {
            this.peerConnection.setLocalDescription(offer);
            this.signaling.sendOffer(this.peerId, offer);
        });
    }

    public addStream(stream: MediaStream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => {
            this.peerConnection.addTrack(track, stream);
        })
    }
}