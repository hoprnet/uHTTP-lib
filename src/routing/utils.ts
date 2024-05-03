import debug from 'debug';

export function logger(namespaces: string[]) {
    const ns = namespaces.join(':');
    const verbose = debug(`${ns}:verbose`);
    verbose.log = console.log.bind(console);
    const info = debug(`${ns}:info`);
    info.log = console.info.bind(console);
    const warn = debug(`${ns}:warn`);
    warn.log = console.warn.bind(console);
    const error = debug(`${ns}:error`);
    error.log = console.error.bind(console);

    return {
        error,
        info,
        verbose,
        warn,
    };
}

export function setDebugScopeLevel(defaultLogLevel: string, scope?: string, level?: string) {
    const scp = scope ? scope : '*';
    const lvl = debugLevel(defaultLogLevel, level);
    debug.enable([scp, lvl].join(','));
}

function debugLevel(defaultLogLevel: string, level?: string) {
    const lvl = level ? level : defaultLogLevel;
    switch (lvl.toLowerCase()) {
        case 'error':
            return '-*:warn,-*:info,-*:verbose';
        case 'warn':
            return '-*:info,-*:verbose';
        case 'info':
            return '-*:verbose';
        case 'verbose':
            return '';
        default:
            return debugLevel(defaultLogLevel);
    }
}
