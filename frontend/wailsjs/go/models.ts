export namespace main {
	
	export class ConnectOptions {
	    url: string;
	    protocol: string;
	    headers: Record<string, string>;
	    reconnect: boolean;
	    pingSec: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.headers = source["headers"];
	        this.reconnect = source["reconnect"];
	        this.pingSec = source["pingSec"];
	    }
	}
	export class Msg {
	    id: number;
	    dir: string;
	    time: string;
	    text: string;
	    pretty: string;
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new Msg(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.dir = source["dir"];
	        this.time = source["time"];
	        this.text = source["text"];
	        this.pretty = source["pretty"];
	        this.bytes = source["bytes"];
	    }
	}
	export class Profile {
	    name: string;
	    url: string;
	    protocol: string;
	    headers: Record<string, string>;
	    reconnect: boolean;
	    pingSec: number;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.headers = source["headers"];
	        this.reconnect = source["reconnect"];
	        this.pingSec = source["pingSec"];
	    }
	}
	export class SessionInfo {
	    name: string;
	    path: string;
	    size: number;
	    modTime: string;
	    url?: string;
	    day?: string;
	    matchCount?: number;
	    matchHint?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	        this.url = source["url"];
	        this.day = source["day"];
	        this.matchCount = source["matchCount"];
	        this.matchHint = source["matchHint"];
	    }
	}
	export class SessionDetail {
	    info: SessionInfo;
	    url: string;
	    protocol: string;
	    messages: Msg[];
	    notes: string[];
	
	    static createFrom(source: any = {}) {
	        return new SessionDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.info = this.convertValues(source["info"], SessionInfo);
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.messages = this.convertValues(source["messages"], Msg);
	        this.notes = source["notes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Status {
	    state: string;
	    url: string;
	    protocol: string;
	    session: string;
	    msgCount: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.session = source["session"];
	        this.msgCount = source["msgCount"];
	        this.error = source["error"];
	    }
	}

}

