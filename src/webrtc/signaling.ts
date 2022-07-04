import { json } from "stream/consumers";
import { Call, Dialing, Incomming, WsDialing, WsIncomming } from "./dialing";

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
    content: string;
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
    onIncomming: (peerId: string, incoming: Incomming) => void;
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

    private messageListeners: Array<(m: SignalingMessage) => void> = new Array();
    private incommings = new Map<string, Incomming>();

    myId: string | null = null;

    onIncomming: (peerId: string, incoming: Incomming) => void = () => { }
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

    sendOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        return this.sendMessage(peerId, {
            type: SignalingType.Offer,
            content: JSON.stringify(offer)
        });
    }

    sendAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        return this.sendMessage(peerId, {
            type: SignalingType.Answer,
            content: JSON.stringify(answer)
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
                this.beautifulLog('send: ' + JSON.stringify(message));
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
        this.beautifulLog('message: ' + messageEvent.data);

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
        this.beautifulLog('onSignalingMessage: ' + JSON.stringify(m));
        this.messageListeners.forEach(l => l(m));

        switch (m.type) {
            case SignalingType.Hi:
                this.helloToFriend(m.content, true);
                this.onHelloCallback(m.content, false)
                break;
            case SignalingType.Hello:
                this.onHelloCallback(m.content, true)
                break;
            case SignalingType.Dialing:
                const peer = JSON.parse(m.content);
                if (!this.incommings.has(peer.Id)) {
                    const incomming = new WsIncomming(peer, this);
                    this.incommings.set(peer.Id, incomming);
                    this.onIncomming(peer.Id, incomming);
                }
        }
    }

    private onError(errorEvent: Event) {
        this.myId = null;
        this.beautifulLog('error, ' + errorEvent);
    }

    private onClose(closeEvent: CloseEvent) {
        this.myId = null;
        this.beautifulLog('disconnected, ' + closeEvent);
    }

    private onOpen() {
        this.myId = null;
        this.beautifulLog('connected');
    }

    private beautifulLog(message: string) {
        this.logCallback("Signaling: " + message)
        console.log('%s %c%s', 'Signaling', 'color: #000000; font-weight: bold;', message);
    }
}