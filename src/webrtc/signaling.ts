import { Incomming, PeerInfo, WsIncomming } from "./dialing";
import { mLog } from "./log";

export enum SignalingType {
    Hi = "hi",
    Hello = "hello",

    Dialing = "dialing",
    Accept = "accept",
    Reject = "reject",
    Hangup = "hanup",
    Cancel = "cancel",

    Offer = "webrtc_offer",
    Answer = "webrtc_answer",
    Ice = "webrtc_ice",
    Close = "webrtc_close",
    Candidate = "webrtc_caditate",
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
    avaliable(): boolean;
    sendOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void>;
    sendAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void>;
    onIncomming: (peerInfo: PeerInfo, incoming: Incomming) => void;
    onOffer: (peerId: string, offer: RTCSessionDescriptionInit) => void;
    onAnswer: (peerId: string, answer: RTCSessionDescriptionInit) => void;
}

export class WsSignaling implements Signaling {

    private ws: WebSocket;
    private url: string;
    private onMessageCallback: (message: any) => void = () => { };
    private heartbeatTimer: NodeJS.Timer | null = null;
    private seq = 0;
    private idCallback: (id: string) => void = () => { }

    private messageListeners: ((m: SignalingMessage) => void)[] = [];
    private incommings = new Map<string, Incomming>();

    myId: string | null = null;

    onIncomming: (peerInfo: PeerInfo, incoming: Incomming) => void = () => { }
    onOffer: (peerId: string, offer: RTCSessionDescriptionInit) => void = () => { };
    onAnswer: (peerId: string, answer: RTCSessionDescriptionInit) => void = () => { };
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

    avaliable(): boolean {
        return this.ws.readyState === WebSocket.OPEN && this.myId !== null;
    }

    sendOffer(peerId: string, dsp: RTCSessionDescriptionInit): Promise<void> {
        mLog("signaling", 'send offer: ' + peerId);
        const cnt: DspMessage = {
            peerId: peerId,
            sdp: dsp,
        }
        return this.sendMessage(peerId, {
            type: SignalingType.Offer,
            content: cnt,
        });
    }

    sendAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        mLog("signaling", 'send answer: ' + peerId);
        const cnt: DspMessage = {
            peerId: peerId,
            sdp: answer,
        }
        return this.sendMessage(peerId, {
            type: SignalingType.Answer,
            content: cnt,
        });
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
            });
        }, 20000);
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
        this.sendMessage(id, {
            type: replay ? SignalingType.Hello : SignalingType.Hi,
            content: this.myId!!
        }).then()
    }

    public sendSignaling(to: string, type: SignalingType, content: any): Promise<void> {
        return this.sendMessage(to, {
            type: type,
            content: JSON.stringify(content)
        })
    }

    public async sendMessage(to: string, data: SignalingMessage): Promise<void> {
        await this.send({
            action: "message.cli",
            data: data,
            seq: this.seq++,
            from: this.myId,
            to: to,
        });
        return await Promise.resolve();
    }

    private send(message: Message): Promise<Message> {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error("WebSocket is not open"))
            } else {
                mLog("signaling", 'send: ' + message.action);
                this.ws.send(JSON.stringify(message));
                resolve(message);
            }
        });
    }

    deleteIncomming(peerId: string) {
        if (this.incommings.has(peerId)) {
            this.incommings.delete(peerId);
        }
    }

    public onMessageReceived(callback: (message: any) => void) {
        this.onMessageCallback = callback;
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

    private onSignalingMessage(m: SignalingMessage) {
        mLog("signaling", 'on signaling: ' + m.type);
        this.messageListeners.forEach(l => l(m));

        switch (m.type) {
            case SignalingType.Offer:
                const offer: DspMessage = JSON.parse(m.content);
                this.onOffer(offer.peerId, offer.sdp);
                break
            case SignalingType.Answer:
                const answer: DspMessage = JSON.parse(m.content);
                this.onAnswer(answer.peerId, answer.sdp);
                break
            case SignalingType.Hi:
                this.helloToFriend(m.content, true);
                this.onHelloCallback(m.content, false)
                break;
            case SignalingType.Hello:
                this.onHelloCallback(m.content, true)
                break;
            case SignalingType.Dialing:
                const peer = JSON.parse(m.content) as PeerInfo;
                if (!this.incommings.has(peer.id)) {
                    const incomming = new WsIncomming(peer, this);
                    this.incommings.set(peer.id, incomming);
                    this.onIncomming(peer, incomming);
                }
        }
    }

    private onError(errorEvent: Event) {
        this.myId = null;
        mLog("signaling", 'error, ' + errorEvent);
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