import { PeerInfo } from "./dialing";
import { mLog } from "./log";
import { Signaling, WsSignaling } from "./signaling";

export class Peer {

    connection: RTCPeerConnection;
    private remoteStream: ReadonlyArray<MediaStream> | null = null;
    private localStream: MediaStream | null = null;
    private signaling: Signaling;
    peerId: string

    peerInfo: PeerInfo | null = null;

    onTrack: (track: RTCTrackEvent) => void = () => { };

    private constructor(peerId: string, config: RTCConfiguration, signaling: Signaling) {
        this.signaling = signaling;
        this.peerId = peerId;
        this.connection = new RTCPeerConnection(config);
    }

    public static create(peerInfo: PeerInfo, config: RTCConfiguration, signaling: Signaling): Peer {
        const peer = new Peer(peerInfo.id, config, signaling);
        peer.init();
        return peer;
    }

    public init() {
        this.connection.onnegotiationneeded = () => {
            mLog("peer", 'on negotiation needed');
        };
        this.connection.onsignalingstatechange = () => {
            mLog("peer", 'on signaling state change: ' + this.connection!.signalingState);
        }
        this.connection.onconnectionstatechange = () => {
            mLog("peer", 'on connection state change: ' + this.connection!.connectionState);
        };
        this.connection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            mLog("peer", 'on ice candidate: ' + event.type);
            // this.connection.addIceCandidate(event.candidate).catch(error => {
            // console.log('Error adding candidate: ' + error);
            // });
        };
        this.connection.ontrack = (event: RTCTrackEvent) => {
            this.remoteStream = event.streams;
            this.onTrack(event);
            event.track.onunmute = () => {
                console.log('remote track unmuted');
            }
            event.track.onmute = () => {
                console.log('remote track muted');
            }
            event.track.onended = () => {
                console.log('remote track ended');
            }
            mLog("peer", ' ontrack' + event.track);
        };
    }

    public async attachLocalStream(): Promise<MediaStream> {
        mLog("peer", 'add local stream');
        if (this.localStream != null && this.localStream.active) {
            this.addStream(this.localStream);
            return Promise.resolve(this.localStream);
        } else {
            const stream_1 = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            this.localStream = stream_1;
            this.addStream(stream_1);
            return stream_1;
        }
    }

    public close() {
        (this.signaling as WsSignaling).deleteIncomming(this.peerId);

        if (this.remoteStream !== null) {
            this.remoteStream.forEach(stream => {
                stream.getTracks().forEach(track => {
                    track.stop();
                });
            });
        }
        this.closeLocalStream();
        this.connection.getSenders().forEach(sender => {
            sender.track?.stop();
        })
        this.connection.getReceivers().forEach(receiver => {
            receiver.track?.stop();
        })
        this.connection.close();
    }

    public closeLocalStream() {
        if (this.localStream !== null) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
        }
    }

    public onAnswer(answer: RTCSessionDescriptionInit) {
        this.connection!.setRemoteDescription(answer).catch(error => {
            mLog("peer", 'Error setting remote description:' + error);
        });
    }

    public sendAnswer(remote: RTCSessionDescriptionInit) {
        this.connection!.setRemoteDescription(remote);
        this.connection!.createAnswer().then(answer => {
            this.connection!.setLocalDescription(answer);
            this.signaling.sendAnswer(this.peerId, answer);
        });
    }

    public sendOffer() {
        this.connection.createOffer();
        this.connection.createOffer().then(offer => {
            this.connection.setLocalDescription(offer);
            this.signaling.sendOffer(this.peerId, offer);
        });
    }

    public async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        this.connection.setRemoteDescription(offer);
        const answer = await this.connection.createAnswer();
        this.connection.setLocalDescription(answer);
        return answer;
    }

    public async createOffer(): Promise<RTCSessionDescriptionInit> {
        const offer = await this.connection.createOffer();
        this.connection.setLocalDescription(offer);
        return offer;
    }

    public addStream(stream: MediaStream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => {
            this.connection.addTrack(track, stream);
        })
    }
}