import { off } from "process";

export async function testWebRTC(s: (stream: MediaStream) => void): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    connectionPeer(stream, s);
    return stream;
}

function connectionPeer(stream: MediaStream, s: (stream: MediaStream) => void) {
    const rtcPeerConnectionConfig: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ],
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
    private remoteStream: MediaStream | null = null;
    private peerConnection: RTCPeerConnection;
    private rtcPeerConnectionConfig: RTCConfiguration = {};

    constructor() {
        this.rtcPeerConnectionConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
        };
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
        this.peerConnection.ondatachannel = (event: RTCDataChannelEvent) => {
            console.log('Received data channel');
            event.channel.onopen = () => {
                console.log('Data channel is open');
            }
            event.channel.onclose = () => {
                console.log('Data channel is closed');
            }
            event.channel.onmessage = (event: MessageEvent) => {
                console.log('Received message: ' + event.data);
            }
        }
    }

    call(remotePeerId: string): Promise<MediaStream> {
        return new Promise((resolve, reject) => {
            this.getLocalMediaStream().then(l => {
                if (!this.localStream) {
                    reject('no local stream');
                    return;
                }
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection!.addTrack(track, this.localStream!);
                });

                this.peerConnection.ontrack = (event: RTCTrackEvent) => {
                    this.remoteStream = event.streams[0];
                    resolve(this.remoteStream);
                };
                this.peerConnection.createOffer().then(offer => {
                    this.peerConnection.setLocalDescription(offer);
                    this.sendOffer(remotePeerId, offer);
                });
            })
        });
    }

    sendIceCandidate(remotePeerId: string, candidate: RTCIceCandidate) {
        console.log('Sending ICE candidate to ' + remotePeerId);
        this.sendMessage(remotePeerId, {
            type: 'candidate',
            candidate: candidate,
        });
    }

    sendOffer(remotePeerId: string, offer: RTCSessionDescriptionInit) {
        console.log('Sending offer to ' + remotePeerId);
        console.log('Offer:' + JSON.stringify(offer));
        const answer = prompt('offer created, copy in your browser console, Paste the answer in the prompt');
        if (answer) {
            this.peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
        }
    }

    mockAnswer(offer: string): Promise<MediaStream> {
        return new Promise((resolve, reject) => {
            this.peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));
            this.peerConnection.createAnswer().then(answer => {
                this.peerConnection.setLocalDescription(answer);
                console.log('Answer:\n' + JSON.stringify(answer));
                alert('answer created copy in your browser console');
            });
            // if (!this.localStream) {
            // reject('no local stream');
            // return;
            // }
            // this.localStream.getTracks().forEach(track => {
            //     this.peerConnection!.addTrack(track, this.localStream!);
            // });

            this.peerConnection.ontrack = (event: RTCTrackEvent) => {
                this.remoteStream = event.streams[0];
                resolve(this.remoteStream);
            };
        });
    }

    close() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
    }

    sendAnswer(remotePeerId: string) {
        console.log('Sending answer to ' + remotePeerId);
        this.peerConnection!.createAnswer().then(answer => {
            this.peerConnection!.setLocalDescription(answer);
            this.sendMessage(remotePeerId, {
                type: 'answer',
                answer: answer,
            });
        }
        ).catch(error => {
            console.error('Error creating answer', error);
        });
    }

    handleMessage(remotePeerId: string, message: any) {
        switch (message.type) {
            case 'candidate':
                this.peerConnection!.addIceCandidate(message.candidate).catch(error => {
                    console.error('Error adding received ICE candidate', error);
                }
                );
                break;
            case 'offer':
                this.peerConnection!.setRemoteDescription(message.offer).then(() => {
                    this.sendAnswer(remotePeerId);
                }
                ).catch(error => {
                    console.error('Error setting remote offer', error);
                }
                );
                break;
            case 'answer':
                this.peerConnection!.setRemoteDescription(message.answer).catch(error => {
                    console.error('Error setting remote answer', error);
                }
                );
                break;
            default:
                console.error('Unrecognized message type: ' + message.type);
                break;
        }
    }

    sendMessage(remotePeerId: string, message: any) {
        console.log('Sending message to ' + remotePeerId);

    }

    stopLocalMediaStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    getLocalMediaStream() {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                this.localStream = stream;
                return stream;
            });
    }

    openSignalingChannel(config: any) {
    }
}