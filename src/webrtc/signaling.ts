import { Incoming, PeerInfo, WsIncoming } from "./dialing";
import { mLog } from "./log";

export enum SignalingType {
    Hi = "hi",
    Hello = "hello",

    Dialing = "dialing",
    Accept = "accept",
    Reject = "reject",
    Hangup = "hangup",
    Cancel = "cancel",

    Offer = "webrtc_offer",
    Answer = "webrtc_answer",
    Ice = "webrtc_ice",
    Close = "webrtc_close",
    Candidate = "webrtc_candidate",
}

interface Message {
    action: string;
    data: any | null;
    seq: number;
    from: string | null;
    to: string | null;
}

export interface SignalingMessage {
    type: string;
    content: any;
}

export interface DspMessage {
    peerId: string;
    sdp: any;
}

interface Hello {
    server_version: string | null;
    temp_id: string | null;
    heartbeat_interval: number | null;
}

export interface Signaling {
    myId: string | null;
    available(): boolean;
    onIncoming: (peerInfo: PeerInfo, incoming: Incoming) => void;
    sendSignaling(to: string, type: SignalingType, content: any): Promise<void>
    addMessageListener(l: (m: SignalingMessage) => void): () => void
}

export class WsSignaling implements Signaling {

    private ws: WebSocket;
    private url: string;
    private onMessageCallback: (message: any) => void = () => { };
    private heartbeatTimer: NodeJS.Timer | null = null;
    private seq = 0;
    private idCallback: (id: string) => void = () => { }

    private messageListeners: ((m: SignalingMessage) => void)[] = [];
    private incomingList = new Map<string, Incoming>();

    myId: string | null = null;

    onIncoming: (peerInfo: PeerInfo, incoming: Incoming) => void = () => { }
    onHelloCallback: (id: string, replay: boolean) => void = () => { }
    logCallback: (message: string) => void = () => { };

    constructor(url: string) {
        this.url = url;
        this.ws = new WebSocket(url);
        this.ws.onerror = (e) => this.onError(e);
        this.ws.onopen = () => this.onOpen()
        this.ws.onclose = (e) => this.onClose(e)
        this.ws.onmessage = (e) => this.onMessage(e)
        this.startHeartbeat();
    }

    available(): boolean {
        return this.ws.readyState === WebSocket.OPEN && this.myId !== null;
    }

    addMessageListener(l: (m: SignalingMessage) => void): () => void {
        this.messageListeners.push(l);
        return () => {
            this.messageListeners = this.messageListeners.filter(x => x !== l);
        }
    }

    private startHeartbeat() {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(() => {
            this.send({
                action: "heartbeat",
                data: null,
                seq: this.seq++,
                from: "",
                to: ""
            }).then(r => {
                //
            });
        }, 15000);
    }

    public setIdCallback(callback: (id: string) => void) {
        this.idCallback = callback;
    }

    public close() {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
        }
        this.ws.readyState === WebSocket.OPEN && this.ws.close();
    }

    public helloToFriend(id: string, replay: boolean = false) {
        this.sendSignaling(id, replay ? SignalingType.Hello : SignalingType.Hi, this.myId!!).then();
    }

    public async sendSignaling(to: string, type: SignalingType, content: any): Promise<void> {

        return this.send({
            action: "message.cli",
            data: {
                type: type,
                content: content
            },
            seq: this.seq++,
            from: this.myId,
            to: to,
        }).then();
    }

    private send(message: Message): Promise<Message> {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error("WebSocket is not open"))
            } else {
                this.ws.send(JSON.stringify(message));
                resolve(message);
            }
        });
    }

    deleteIncoming(peerId: string) {
        if (this.incomingList.has(peerId)) {
            this.incomingList.delete(peerId);
        }
    }

    private onMessage(messageEvent: MessageEvent) {
        const message: Message = JSON.parse(messageEvent.data as string);

        switch (message.action) {
            case "message.cli":
                this.onSignalingMessage(message.data as SignalingMessage);
                break;
            case "hello":
                const h = message.data as Hello
                this.myId = h.temp_id;
                this.idCallback(this.myId!!);
                break
            default:
        }
    }

    private onSignalingMessage(msg: SignalingMessage) {
        mLog("signaling", 'receive: ' + msg.type);


        this.messageListeners.forEach(l => l(msg));

        switch (msg.type) {
            case SignalingType.Hi:
                this.helloToFriend(msg.content, true);
                this.onHelloCallback(msg.content, false)
                break;
            case SignalingType.Hello:
                this.onHelloCallback(msg.content, true)
                break;
            case SignalingType.Dialing:
                const peer = msg.content as PeerInfo;
                if (!this.incomingList.has(peer.id)) {
                    const incomming = new WsIncoming(peer, this);
                    this.incomingList.set(peer.id, incomming);
                    this.onIncoming(peer, incomming);
                }
        }
    }

    private onError(errorEvent: Event) {
        this.myId = null;
        mLog("signaling", 'error, ' + JSON.stringify(errorEvent));
    }

    private onClose(closeEvent: CloseEvent) {
        this.myId = null;
        mLog("signaling", 'disconnected: ' + closeEvent.code + "," + closeEvent.reason);
    }

    private onOpen() {
        this.myId = null;
        mLog("signaling", 'connected');
    }
}