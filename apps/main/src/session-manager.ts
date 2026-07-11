import { type Session, session } from 'electron'

export interface SessionConfig {
  name: string
  partition: string
  inMemory: boolean
}

export class SessionManager {
  private sessions = new Map<string, SessionConfig>()

  constructor() {
    this.registerDefaultSession()
  }

  private registerDefaultSession(): void {
    this.sessions.set('default', {
      name: 'default',
      partition: 'persist:default',
      inMemory: false,
    })
    this.sessions.set('incognito', {
      name: 'incognito',
      partition: 'persist:incognito',
      inMemory: true,
    })
  }

  getSession(name: string): Session {
    let config = this.sessions.get(name)
    if (!config) {
      config = {
        name,
        partition: `persist:${name}`,
        inMemory: false,
      }
      this.sessions.set(name, config)
    }
    return session.fromPartition(config.partition, {
      cache: !config.inMemory,
    })
  }

  getPartitions(): string[] {
    return Array.from(this.sessions.keys())
  }
}
