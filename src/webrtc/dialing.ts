import { mLog } from "./log";
import { Peer } from "./peer";
import { SignalingMessage, SignalingType, WsSignaling } from "./signaling";
import { rtcConfig } from "./webrtc";

export interface PeerInfo {
    id: string
    sdp?: any | null
}

export interface Dialing {
    peer: Peer;
    cancel(): Promise<void>;
    onFail: (error: string) => void;
    onAccept: (accept: Dialog) => void;
    onReject: () => void;
}

export interface Incomming {
    peerInfo: PeerInfo;
    accept(): Promise<Dialog>;
    reject(): Promise<void>;
    onCancel: () => void;
}

export interface Dialog {
    peer: Peer;
    openMedia(): Promise<MediaStream>;
    onRemoteTrack(c: (r: RTCTrackEvent) => void): void;
    onHangup: () => void;
    hangup(): Promise<void>;
}

export interface Media {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
}

export class WsDialog implements Dialog {

    onHangup: () => void = () => { };
    peer: Peer;
    private signaling: WsSignaling;

    private removeMessageListener: () => void;

    constructor(peer: Peer, signaling: WsSignaling) {
        this.peer = peer;
        this.signaling = signaling;
        this.removeMessageListener = this.signaling.addMessageListener((m: SignalingMessage) => {
            if (m.type === SignalingType.Hangup) {
                const peerInfo = JSON.parse(m.content) as PeerInfo
                if (peerInfo.id === this.peer.peerId) {
                    this.removeMessageListener()
                    this.onHangup();
                    this.closeConnection();
                }
            }
        })
    }

    private closeConnection() {
        this.peer.close();
    }

    async openMedia(): Promise<MediaStream> {
        const stream = await this.peer.attachLocalStream(false);
        return stream;
    }

    closeMediaStream() {
        this.peer.closeLocalStream();
    }

    onRemoteTrack(onTrack: (r: RTCTrackEvent) => void) {
        this.peer.onTrack = (r) => {
            onTrack(r)
        }
    }

    hangup(): Promise<void> {
        this.removeMessageListener()
        this.closeConnection()

        const p: PeerInfo = {
            id: this.signaling.myId!!
        }

        return this.signaling.sendMessage(this.peer.peerId, {
            type: SignalingType.Hangup,
            content: JSON.stringify(p),
        });
    }
}

export class WsDialing implements Dialing {

    private signaling: WsSignaling;
    private callTimer: NodeJS.Timer | null = null;
    private myInfo: PeerInfo;
    private removeMessageListener: () => void = () => { }

    private accepted: boolean = false;

    private failCallback: (error: string) => void = () => { }

    onAccept: ((accept: Dialog) => void) = () => { };
    onReject: (() => void) = () => { };
    onFail: ((msg: string) => void) = () => { };

    peer: Peer;
    peerId: string;

    constructor(peerId: string, s: WsSignaling) {
        this.peer = Peer.create({ id: peerId }, rtcConfig, s);
        this.myInfo = {
            id: s.myId!!,
        };
        this.peerId = peerId;
        this.signaling = s;
    }

    public cancel(): Promise<void> {
        this.callTimer && clearInterval(this.callTimer!!);
        this.removeMessageListener()
        return this.signaling.sendSignaling(this.peerId, SignalingType.Cancel, this.myInfo)
    }

    async dial(): Promise<Dialing> {

        if (!this.signaling.avaliable()) {
            return Promise.reject("Signaling not avaliable");
        }
        mLog("WsDialing", "dial:" + this.peerId);

        await this.peer.attachLocalStream(true)

        return this.peer.createOffer()
            .catch(e => {
                console.error(e);
                return this;
            })
            .then(offer => {
                this.myInfo.sdp = offer;

                this.removeMessageListener();
                this.removeMessageListener = this.signaling.addMessageListener((m: SignalingMessage) => {
                    if (m.type === SignalingType.Accept) {
                        this.receiveAccept(m);
                    } else if (m.type === SignalingType.Reject) {
                        this.receiveReject(m);
                    }
                });

                this.callTimer = setInterval(() => {
                    this.dialOnce();
                }, 1000);

                return this;
            })
            .catch(err => {
                this.onFail(err.message);
                return this;
            });
    }

    private receiveAccept(m: SignalingMessage) {
        mLog("WsDialing", "receive accept:" + m.content);
        const peerInfo = JSON.parse(m.content) as PeerInfo
        if (peerInfo.id === this.peerId) {
            this.accepted = true;
            this.callTimer && clearInterval(this.callTimer!!);
            this.removeMessageListener()
            const dialog = new WsDialog(this.peer, this.signaling)
            this.onAccept(dialog)
        }
    }

    private receiveReject(m: SignalingMessage) {
        mLog("WsDialing", "receive reject:" + m.content);
        const peerInfo = JSON.parse(m.content) as PeerInfo
        if (peerInfo.id === this.peerId) {
            this.callTimer && clearInterval(this.callTimer!!);
            this.removeMessageListener()
            this.onReject()
        }
    }

    private dialOnce() {
        if (this.accepted) {
            this.callTimer && clearInterval(this.callTimer!!);
            this.removeMessageListener()
            return;
        }

        if (!this.signaling.avaliable()) {
            this.callTimer && clearInterval(this.callTimer!!);
            this.removeMessageListener()
            this.failCallback("Signaling not avaliable")
            return;
        }

        this.signaling.sendMessage(this.peerId, {
            type: SignalingType.Dialing,
            content: JSON.stringify(this.myInfo)
        }).then(() => {

        }).catch(e => {
            this.cancel();
            this.failCallback(e.message)
        });

    }
}

export class WsIncomming implements Incomming {

    private signaling: WsSignaling;
    private removeMessageListener: () => void;
    private timeout: NodeJS.Timer | null = null;

    peerInfo: PeerInfo;

    peer: Peer;
    onCancel: () => void = () => { };

    constructor(peer: PeerInfo, signaling: WsSignaling) {
        this.peerInfo = peer;
        this.peer = Peer.create(peer, rtcConfig, signaling);
        this.signaling = signaling;

        this.checkActive()

        this.removeMessageListener = signaling.addMessageListener((m: SignalingMessage) => {
            if (m.type === SignalingType.Dialing) {
                const peerInfo = JSON.parse(m.content) as PeerInfo
                if (peerInfo.id === this.peerInfo.id) {
                    this.checkActive()
                }
            } else if (m.type === SignalingType.Cancel) {
                const peerInfo = JSON.parse(m.content) as PeerInfo
                if (peerInfo.id === this.peerInfo.id) {
                    this.removeMessageListener()
                    this.timeout && clearInterval(this.timeout!!);
                    this.onCancel()
                    this.signaling.deleteIncomming(this.peerInfo.id)
                }
            }
        })
    }

    private checkActive() {
        this.timeout && clearInterval(this.timeout!!);

        this.timeout = setTimeout(() => {
            this.onCancel();
            this.signaling.deleteIncomming(this.peerInfo.id)
            this.removeMessageListener()
        }, 2000);
    }

    async accept(): Promise<Dialog> {
        await this.peer.attachLocalStream(false)

        const answer = await this.peer.createAnswer(this.peerInfo.sdp);
        const myInfo: PeerInfo = {
            id: this.signaling.myId!!,
            sdp: answer,
        };
        this.signaling.sendSignaling(this.peerInfo.id, SignalingType.Accept, myInfo);
        this.removeMessageListener();
        this.timeout && clearInterval(this.timeout!!);
        return new WsDialog(this.peer, this.signaling);
    }

    reject(): Promise<void> {
        this.removeMessageListener()
        this.timeout && clearInterval(this.timeout!!);
        this.signaling.deleteIncomming(this.peerInfo.id)

        return this.signaling.sendSignaling(this.peerInfo.id, SignalingType.Reject, { id: this.signaling.myId })
    }
}