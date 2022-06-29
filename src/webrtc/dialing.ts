import { SignalingMessage, SignalingType, WsSignaling } from "./signaling";

export interface PeerInfo {
    Id: string
}

export interface Dialing {
    peerId: string
    cancel(): Promise<void>;
    onFail: (error: string) => void;
    onAccept: (accept: Call) => void;
}

export interface Incomming {
    peer: PeerInfo;

    accept(): Promise<Call>;
    reject(): void;
    onCancel: () => void;
}

export interface Call {
    peer: PeerInfo;
    onHangup: () => void;
    hangup(): Promise<void>;
}

export class WsCall implements Call {

    onHangup: () => void = () => { };
    peer: PeerInfo;
    private signaling: WsSignaling;

    private removeMessageListener: () => void;

    constructor(peer: PeerInfo, signaling: WsSignaling) {
        this.peer = peer;
        this.signaling = signaling;
        this.removeMessageListener = this.signaling.addMessageListener((m: SignalingMessage) => {
            if (m.type === SignalingType.Hangup) {
                const peerInfo = JSON.parse(m.content) as PeerInfo
                if (peerInfo.Id == this.peer.Id) {
                    this.removeMessageListener()
                    this.onHangup();
                }
            }
        })
    }

    hangup(): Promise<void> {
        this.removeMessageListener()

        const p: PeerInfo = {
            Id: this.signaling.myId!!
        }

        return this.signaling.sendMessage(this.peer.Id, {
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

    onAccept: ((accept: Call) => void) = () => { };
    onFail: ((msg: string) => void) = () => { };

    peerId: string;

    constructor(peerId: string, s: WsSignaling) {
        this.peerId = peerId;
        this.myInfo = {
            Id: s.myId!!
        };
        this.signaling = s;
    }

    public cancel(): Promise<void> {
        this.callTimer && clearInterval(this.callTimer!!);
        this.removeMessageListener()

        return this.signaling.sendSignaling(this.peerId, SignalingType.Cancel, this.myInfo)
    }

    dial(): Promise<void> {
        if (!this.signaling.avaliable()) {
            return Promise.reject("Signaling not avaliable");
        }

        return new Promise((resolve, reject) => {

            console.log('Dialing ' + this.peerId);

            this.removeMessageListener()
            this.removeMessageListener = this.signaling.addMessageListener((m: SignalingMessage) => {
                if (m.type === SignalingType.Accept) {
                    const peerInfo = JSON.parse(m.content) as PeerInfo
                    if (peerInfo.Id == this.peerId) {
                        this.accepted = true;
                        this.callTimer && clearInterval(this.callTimer!!);
                        this.removeMessageListener()
                        this.onAccept(new WsCall(peerInfo, this.signaling))
                    }
                }
            });

            this.callTimer = setInterval(() => {
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

            }, 1000);

            resolve()
        })


    }
}

export class WsIncomming implements Incomming {

    private signaling: WsSignaling;
    private removeMessageListener: () => void;
    private timeout: NodeJS.Timer | null = null;

    peer: PeerInfo;
    onCancel: () => void = () => { };

    constructor(peer: PeerInfo, signaling: WsSignaling) {
        this.peer = peer;
        this.signaling = signaling;

        this.checkActive()

        this.removeMessageListener = signaling.addMessageListener((m: SignalingMessage) => {
            if (m.type === SignalingType.Dialing) {
                const peerInfo = JSON.parse(m.content) as PeerInfo
                if (peerInfo.Id == this.peer.Id) {
                    this.checkActive()
                }
            } else if (m.type === SignalingType.Cancel) {
                const peerInfo = JSON.parse(m.content) as PeerInfo
                if (peerInfo.Id == this.peer.Id) {
                    this.removeMessageListener()
                    this.timeout && clearInterval(this.timeout!!);
                    this.onCancel()
                }
            }
        })
    }

    private checkActive() {
        this.timeout && clearInterval(this.timeout!!);

        this.timeout = setTimeout(() => {
            this.onCancel();
            this.removeMessageListener()
        }, 2000);
    }

    accept(): Promise<Call> {
        const myInfo: PeerInfo = {
            Id: this.signaling.myId!!
        }
        return this.signaling.sendSignaling(this.peer.Id, SignalingType.Accept, myInfo)
            .then(() => {
                this.removeMessageListener()
                this.timeout && clearInterval(this.timeout!!);
                return new WsCall(this.peer, this.signaling)
            });
    }

    reject(): void {
        this.removeMessageListener()
        this.timeout && clearInterval(this.timeout!!);

        this.signaling.sendSignaling(this.peer.Id, SignalingType.Reject, { Id: this.signaling.myId })
    }
}