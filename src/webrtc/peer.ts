import { Dialing, WsDialing } from "./dialing";
import { Signaling, WsSignaling } from "./signaling";

export class Peer {
    
    private peerConnection: RTCPeerConnection;
    private remoteStream: ReadonlyArray<MediaStream> | null = null;
    private signaling: Signaling;

    onTrack: (stream: ReadonlyArray<MediaStream>) => void = () => { };

    private constructor(private config: RTCConfiguration, signaling: Signaling) {
        this.signaling = signaling;
        this.peerConnection = new RTCPeerConnection(config);
    }

    public static call(peerId: string, config: RTCConfiguration, signaling: Signaling) :Promise<Dialing|null> {
        const peer = new Peer(config, signaling);
        peer.init();
        return peer.dial(peerId);
    }

    public init(){
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

    public dial(peerId:string): Promise<Dialing|null> {
        return new Promise((resolve, reject) => {
            const dialing = new WsDialing(peerId, this.signaling as WsSignaling);
            resolve(dialing);
        })
    }

    public call(peerId:string) {
         this.peerConnection.createOffer();
         this.peerConnection.createOffer().then(offer => {
            this.peerConnection.setLocalDescription(offer);
            this.signaling.sendOffer(peerId, offer);
        });
    }

    public addStream(stream: MediaStream) {
        stream.getTracks().forEach( (track:MediaStreamTrack)=>{
            this.peerConnection.addTrack(track, stream);
        })
    }
}