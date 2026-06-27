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
