//
//  ZenlyApp.swift
//  Zenly
//
//  Created by Andrew Hu on 6/26/26.
//

import SwiftUI
import UserNotifications

@main
struct ZenlyApp: App {
    @State private var store = SessionStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .onOpenURL { url in
                    // Entry point for the SMS agent's tap-to-start link:
                    // zenly://session/start?task=history%20essay&duration=45
                    store.handle(url: url)
                }
                .task {
                    // Request up front so the broadcast extension can post off-task
                    // banners while the app is backgrounded (sendLocalNudge only asks
                    // lazily, which never runs once we're suspended).
                    try? await UNUserNotificationCenter.current()
                        .requestAuthorization(options: [.alert, .sound])
                }
        }
    }
}
