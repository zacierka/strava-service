import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import PocketBase from 'pocketbase';
// import 'dotenv/config';
const app = express();
const port = process.env.PORT;


// PocketBase setup
const pb = new PocketBase(process.env.POCKETBASE_URL);
await pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(process.env.SUPERUSER_EMAIL, process.env.SUPERUSER_PASS, {
    // This will trigger auto refresh or auto reauthentication in case
    // the token has expired or is going to expire in the next 30 minutes.
    autoRefreshThreshold: 30 * 60
})
// Strava credentials
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN;
const STRAVA_CALLBACK_URL = process.env.CB;

// Parse incoming JSON
app.use(bodyParser.json());

// ----------------------
// STEP 1: Verify Subscription
// ----------------------
async function ensureSubscription() {
    const res = await axios.get(
        `https://www.strava.com/api/v3/push_subscriptions?client_id=${STRAVA_CLIENT_ID}&client_secret=${STRAVA_CLIENT_SECRET}`
    );
    let existing = false;
    try {
        existing = res.data.find((s) => s.callback_url === STRAVA_CALLBACK_URL);
    } catch (error) {
        console.log("Error searching callback");
        return;
    }

    if (!existing) {
        console.log('Creating Strava subscription...');
        const sub = await axios.post(
            'https://www.strava.com/api/v3/push_subscriptions',
            {
                client_id: STRAVA_CLIENT_ID,
                client_secret: STRAVA_CLIENT_SECRET,
                callback_url: STRAVA_CALLBACK_URL,
                verify_token: STRAVA_VERIFY_TOKEN,
            }
        );
        console.log('Created new subscription:', sub.data);
    } else {
        console.log('Subscription already exists:', existing.id);
    }
}

// ----------------------
// STEP 2: Verification Challenge
// ----------------------
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === STRAVA_VERIFY_TOKEN) {
        console.log('Webhook verified!');
        return res.json({ 'hub.challenge': req.query['hub.challenge'] });
    }
    res.status(403).send('Invalid verify token');
});

// ----------------------
// STEP 3: Handle Incoming Webhooks
// ----------------------
app.post('/webhook/strava', async (req, res) => {
    const event = req.body;
    console.log('Incoming event:', event);

    if (event.object_type === 'activity' && event.aspect_type === 'create') {
        // Fetch detailed activity info
        const activity = await fetchActivity(event.object_id, event.owner_id);
        await saveActivity(activity);
    }

    if (event.object_type === 'activity' && event.aspect_type === 'update') {
        const activity = await fetchActivity(event.object_id, event.owner_id);
        await updateActivity(activity);
    }

    res.sendStatus(200);
});

// ----------------------
// STEP 4: Helper Functions
// ----------------------
async function fetchActivity(activityId, athleteId) {
    console.log(`Fetching activity: id ${activityId}`);

    const token = await getAccessTokenForAthlete(athleteId);
    const res = await axios.get(
        `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=false`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
}

async function saveActivity(activity) {
    console.log('Saving new activity:', activity.name);
    await pb.collection('strava_activities').create({
        id: activity.id,
        user_id: activity.athlete.id,
        name: activity.name,
        distance: activity.distance,
        moving_time: activity.moving_time,
        elapsed_time: activity.elapsed_time,
        type: activity.type,
        start_date: activity.start_date,
        updated_at: activity.updated_at,
        raw: activity,
    });
}

async function updateActivity(activity) {
    console.log('Updating activity:', activity.id);
    await pb.collection('strava_activities').update(activity.id, {
        name: activity.name,
        distance: activity.distance,
        moving_time: activity.moving_time,
        elapsed_time: activity.elapsed_time,
        updated_at: activity.updated_at,
        raw: activity,
    });
}

// Dummy token retriever (you’d store athlete tokens when they authorize)
async function getAccessTokenForAthlete(athleteId) {
    let record;
    try {
        record = await pb.collection('linked_providers')
            .getFirstListItem(`provider_id="${athleteId}"`);
    } catch (error) {
        console.log("Athlete not found in PocketBase", error);
        return "";
    }

    const now = Math.floor(Date.now() / 1000);

    // If not expired, use it
    if (record.expires_at && record.expires_at > now + 60) {
        return record.access_token;
    }

    // Token expired or missing, refresh it
    return await refreshStravaToken(record);
}

async function refreshStravaToken(record) {
    console.log(`Refreshing token for athlete ${record.provider_id}`);

    try {
        const res = await axios.post("https://www.strava.com/api/v3/oauth/token", {
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: record.refresh_token
        });

        const data = res.data;

        // Update PocketBase
        await pb.collection('linked_providers').update(record.id, {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at
        });

        return data.access_token;
    } catch (error) {
        console.error("Token refresh failed:", error.response?.data || error);
        return null;
    }
}


// ----------------------
// INIT
// ----------------------
app.listen(port, async () => {
    console.log(`Listening on port ${port}`);
    await ensureSubscription();
});
