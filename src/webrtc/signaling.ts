import { json } from "stream/consumers";

interface Message {
    action: string;
    data: any | null;
    seq: number;
    from: string | null;
    to: string | null;
}

interface SignalingMessage {
    type: number;
    content: string;
}

interface Hello {
    server_version: string | null;
    temp_id: string | null;
    heartbeat_interval: number | null;
}

export class Signling {

    private ws: WebSocket;
    private url: string;
    private onMessageCallback: (message: any) => void = () => { };
    private heartbeatTimer: NodeJS.Timer | null = null;
    private myId: string | null = null;
    private seq = 0;
    private idCallback: (id: string) => void = () => { }

    onHelloCallback: (id: string, replay: boolean) => void = () => { }

    logCallback: (message: string) => void = () => { }

    constructor(url: string) {
        this.url = url;
        this.ws = new WebSocket(url);
        this.ws.onerror = (e) => this.onError(e);
        this.ws.onopen = () => this.onOpen()
        this.ws.onclose = (e) => this.onClose(e)
        this.ws.onmessage = (e) => this.onMessage(e)
        this.startHeartbeat();
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
            type: replay ? 2 : 1,
            content: this.myId!!
        })
    }

    public sendMessage(to: string, data: SignalingMessage) {
        this.send({
            action: "message.cli",
            data: data,
            seq: this.seq++,
            from: this.myId,
            to: to,
        });
    }

    private send(message: Message) {
        this.beautifulLog('send: ' + JSON.stringify(message));
        this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify(message));
    }

    public onMessageReceived(callback: (message: any) => void) {
        this.onMessageCallback = callback;
    }

    private onMessage(messageEvent: MessageEvent) {
        const message: Message = JSON.parse(messageEvent.data as string);
        this.beautifulLog('message: ' + messageEvent.data);

        switch (message.action) {
            case "message.cli":
                this.handleMessage(message.data as SignalingMessage);
                break;
            case "hello":
                const h = message.data as Hello
                this.myId = h.temp_id;
                this.idCallback(this.myId!!);
                break
            default:
        }
    }

    private handleMessage(m: SignalingMessage) {
        switch (m.type) {
            case 1:
                this.helloToFriend(m.content, true);
                this.onHelloCallback(m.content, false)
                break;
            case 2:
                this.onHelloCallback(m.content, true)
                break;
        }
    }

    private onError(errorEvent: Event) {
        this.beautifulLog('error, ' + errorEvent);
    }

    private onClose(closeEvent: CloseEvent) {
        this.beautifulLog('disconnected, ' + closeEvent);
    }

    private onOpen() {
        this.beautifulLog('connected');
    }

    private beautifulLog(message: string) {
        this.logCallback("WebSocket: " + message)
        console.log('%s %c%s', 'WebSocket', 'color: #00a8ff; font-weight: bold;', message);
    }
}