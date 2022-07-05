

let logcb: ((s: string) => void) = () => { }

export function setLogCb(cb: (s: string) => void) {
    logcb = cb;
}

export function mLog(tag: string, msg: string) {
    const log = `[${tag}]: ${msg}`
    console.log('%c%s %s', tag, 'color: #000000; font-weight: bold;', msg);
    logcb(log);
}