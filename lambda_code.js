import crypto from "crypto";
import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const bitriseConnectedAppId = <your_bitrise_connected_app_id>;
    const bitriseAPIHost = 'https://api.bitrise.io/release-management/v1'
    const secretsClient = new SecretsManagerClient({
        region: <your_aws_region>,
});

export const handler = async (request) => {
            let authorized;
        try {
            authorized = await verifySignature(request);
  } catch (error) {
    return {
            statusCode: 500,
        body: error,
    };
  }
        if (!authorized) {
    return {
            statusCode: 401,
        body: JSON.stringify('Unauthorized'),
    };
  }

        let statusCode;
        let body;

        // Parse Sentry payload for relevant values to your use-case
        // https://docs.sentry.io/organization/integrations/integration-platform/webhooks/metric-alerts/
        if (request.body.action == "critical") {
    try {
      const token = await getBitriseToken();
        const releaseId = await getActiveBitriseReleaseId(token);
        const result = await pauseBitriseRelease(token, releaseId);
        statusCode = result.status;
      body = (statusCode >= 200 && statusCode < 300) ? `Release ${releaseId} halted` : `Failed to halt release ${releaseId}`;
    } catch (error) {
            body = JSON.stringify(error);
        statusCode = 500;
    }
  } else {
            body = "Action is not critical. Skipping.";
        const statusCode = 204;
  }

        return {
            statusCode: statusCode,
        body: body,
  };
};

        async function verifySignature(request) {
  const response = await secretsClient.send(
        new GetSecretValueCommand({
            SecretId: "sentry_secret",
    })
        );
        const sentrySecret = JSON.parse(response.SecretString).SENTRY_CLIENT_SECRET;
        const hmac = crypto.createHmac("sha256", sentrySecret);
        hmac.update(request.body, "utf8");
        const digest = hmac.digest("hex");
        return digest === request.headers["Sentry-Hook-Signature"];
}

        async function pauseBitriseRelease(token, releaseId) {
  const url = new URL(`${bitriseAPIHost}/releases/${releaseId}/apple-app-store/pause`);

        return await fetch(url, {
            method: 'POST',
        headers: {
            'accept': 'application/json',
        'authorization': token
    }
  });
}

        async function getActiveBitriseReleaseId(token) {
  const url = new URL(`${bitriseAPIHost}/releases`);
        url.searchParams.append('connected_app_id', bitriseConnectedAppId);

        const response = await fetch(url, {
            headers: {
            'accept': 'application/json',
        'authorization': token
    }
  });

        const json = await response.json();

  const release = json.items.find(release =>
        release.status === "in-progress" &&
    release.stages.some(stage => stage.name === "release" && stage.status === "in-progress")
        );

        if (!release) {
    throw new Error("No active release found");
  }

        return release.id;
}

        async function getBitriseToken() {
  const response = await secretsClient.send(
        new GetSecretValueCommand({
            SecretId: "bitrise_token",
    })
        );
        return JSON.parse(response.SecretString).BITRISE_TOKEN;
}