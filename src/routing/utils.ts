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
