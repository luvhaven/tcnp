/**
 * Development-only logger that only shows console messages to dev_admin users
 * Regular users won't see these logs in their console
 */

let isDevAdmin: boolean | null = null

export const setDevAdminStatus = (isDev: boolean) => {
    isDevAdmin = isDev
}

export const devLog = {
    error: (...args: any[]) => {
        if (isDevAdmin === true) {
            console.error('[DEV]', ...args)
        }
    },
    warn: (...args: any[]) => {
        if (isDevAdmin === true) {
            console.warn('[DEV]', ...args)
        }
    },
    info: (...args: any[]) => {
        if (isDevAdmin === true) {
            console.info('[DEV]', ...args)
        }
    },
    log: (...args: any[]) => {
        if (isDevAdmin === true) {
            console.log('[DEV]', ...args)
        }
    }
}

// Always log critical errors regardless of user role
export const criticalError = (...args: any[]) => {
    console.error('[CRITICAL]', ...args)
}
