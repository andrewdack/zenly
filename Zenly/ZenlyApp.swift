//
//  ZenlyApp.swift
//  Zenly
//
//  Created by Andrew Hu on 6/26/26.
//

import SwiftUI

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
        }
    }
}
