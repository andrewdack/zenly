import Foundation

struct JudgeResponse: Decodable {
    let verdict: JudgeVerdict
    let action: JudgeAction
}

struct JudgeVerdict: Decodable {
    let status: String
    let isFocused: Bool?
    let destructiveCategory: String?
    let confidence: Double?
    let reason: String
}

struct JudgeAction: Decodable {
    let type: String
    let level: String?
    let reason: String?
}

struct StartSessionResponse: Decodable {
    let deeplink: String
}

struct EndSessionResponse: Decodable {
    let ended: Bool
    let memoriesAdded: Int
}

struct SessionStatusResponse: Decodable {
    let active: Bool
    let stats: SessionStats?
}

struct SessionStats: Decodable {
    let nudges: Int
    let snitches: Int
    let checkIns: Int
    let lastStatus: String
    let lastReason: String?
}

struct MemoryItem: Decodable {
    let kind: String
    let fact: String
}

struct ProfileStats: Decodable {
    let total: Int
    let byStatus: [String: Int]
    let byCategory: [String: Int]
    let checkIns: Int
    let snitches: Int
}

struct RecentVerdict: Decodable {
    let status: String
    let category: String?
    let reason: String
    let mode: String
}

struct ProfileResponse: Decodable {
    let name: String?
    let memories: [MemoryItem]
    let stats: ProfileStats
    let recentVerdicts: [RecentVerdict]
}

enum ZenlyAPIError: LocalizedError {
    case invalidResponse
    case server(status: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid API response"
        case let .server(status, body):
            return "API returned \(status): \(body)"
        }
    }
}

struct ZenlyAPIClient {
    var baseURL: URL = API_BASE_URL

    @discardableResult
    func startSession(
        userPhone: String,
        mode: FocusMode,
        task: String,
        durationMinutes: Int?,
        interventionLevel: InterventionLevel,
        contactPhone: String,
        name: String
    ) async throws -> StartSessionResponse {
        let trimmedContact = contactPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = StartSessionRequest(
            userPhone: userPhone,
            mode: mode.rawValue,
            task: mode == .guardian ? nil : task,
            durationMinutes: mode == .guardian ? nil : durationMinutes,
            interventionLevel: interventionLevel.label,
            contactPhone: trimmedContact.isEmpty ? nil : trimmedContact,
            name: trimmedName.isEmpty ? nil : trimmedName
        )

        var request = URLRequest(url: baseURL.appendingPathComponent("session/start"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ZenlyAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ZenlyAPIError.server(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(StartSessionResponse.self, from: data)
    }

    func judgeFrame(imageData: Data, userPhone: String) async throws -> JudgeResponse {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("judge"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = multipartBody(boundary: boundary, imageData: imageData, userPhone: userPhone)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ZenlyAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ZenlyAPIError.server(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }

        return try JSONDecoder().decode(JudgeResponse.self, from: data)
    }

    func endSession(userPhone: String) async throws -> EndSessionResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("session/end"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["userPhone": userPhone])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ZenlyAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ZenlyAPIError.server(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(EndSessionResponse.self, from: data)
    }
    
    func fetchSession(userPhone: String) async throws -> SessionStatusResponse {
        let encoded = userPhone.replacingOccurrences(of: "+", with: "%2B")
        guard let url = URL(string: baseURL.absoluteString + "/session/" + encoded) else {
            throw ZenlyAPIError.invalidResponse
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw ZenlyAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ZenlyAPIError.server(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(SessionStatusResponse.self, from: data)
    }

    func fetchProfile(userPhone: String) async throws -> ProfileResponse {
        // E.164 phones contain '+' which URLComponents won't encode in path — do it manually.
        let encoded = userPhone.replacingOccurrences(of: "+", with: "%2B")
        guard let url = URL(string: baseURL.absoluteString + "/profile/" + encoded) else {
            throw ZenlyAPIError.invalidResponse
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw ZenlyAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ZenlyAPIError.server(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(ProfileResponse.self, from: data)
    }

    private struct StartSessionRequest: Encodable {
        let userPhone: String
        let mode: String
        let task: String?
        let durationMinutes: Int?
        let interventionLevel: String
        let contactPhone: String?
        let name: String?
    }

    private func multipartBody(boundary: String, imageData: Data, userPhone: String) -> Data {
        var body = Data()
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"userPhone\"\r\n\r\n")
        body.appendString("\(userPhone)\r\n")
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"image\"; filename=\"frame.jpg\"\r\n")
        body.appendString("Content-Type: image/jpeg\r\n\r\n")
        body.append(imageData)
        body.appendString("\r\n--\(boundary)--\r\n")
        return body
    }
}

private extension Data {
    mutating func appendString(_ string: String) {
        append(Data(string.utf8))
    }
}
