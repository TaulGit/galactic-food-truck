interface StarLetterSdk {
  readonly context: {
    readonly gameId: number
    readonly env: 'dev' | 'prod'
  }
}

interface StarLetterGlobal {
  init(): Promise<StarLetterSdk>
  isPlatformSDKError?(error: unknown): error is {
    readonly code: string
    readonly retryable?: boolean
  }
}

declare global {
  interface Window {
    GameSDK?: StarLetterGlobal
  }
}

/**
 * The game has no platform business capabilities in this MVP. We still perform
 * the required host handshake, while making ordinary browser development safe.
 */
export async function initializeStarLetter(): Promise<void> {
  const gameSdk = window.GameSDK
  if (!gameSdk) {
    console.info('[Star-letter] SDK script is unavailable; continuing in local web mode.')
    return
  }

  try {
    const sdk = await gameSdk.init()
    console.info('[Star-letter] SDK ready', {
      gameId: sdk.context.gameId,
      env: sdk.context.env,
    })
  } catch (error) {
    if (gameSdk.isPlatformSDKError?.(error)) {
      // A direct Vite tab is not embedded by the platform. The playable game
      // remains available locally; use `star-letter dev` for the real handshake.
      console.info(`[Star-letter] host handshake unavailable: ${error.code}`)
      return
    }
    console.warn('[Star-letter] SDK initialization did not complete.', error)
  }
}
