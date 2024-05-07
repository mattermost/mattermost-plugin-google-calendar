# Set up the Mattermost Google Calendar integration

Setting up the [Mattermost Google Calendar integration]() requires the following 3 steps:

1. Mattermost admin: Install the Google Calendar plugin on your Mattermost instance.
2. Google admin: Create a Google Calendar service by creating a Google Cloud project.
3. Mattermost admin: Configure the Mattermost Google Calendar plugin.

Once setup is complete, see the get started documentation to learn how to use this integration.

## Install the Mattermost Google Calendar plugin

To install the Mattermost Google Calendar plugin on your Mattermost server:

1. Log in to your Mattermost workspace as a system administrator.
2. Download the latest version of the plugin binary release compatible with Mattermost v8.x and later.

**Tip**: If you are using an earlier version of Mattermost, follow the Mattermost Product Documentation to [upgrade to Mattermost v8.x](https://docs.mattermost.com/upgrade/upgrading-mattermost-server.html) or later.

## Create a Google Calendar service

1. In a browser, as a Google admin, create a project in the Google Cloud Console by going to `https://console.cloud.google.com/`.
2. Select the project option in the top left corner of the screen, then select **New Project** option in the top right corner of the popup window.

    ![In Google Cloud Console, select New Project to create up a new project.](google-cloud-console-create-project.png)

    ![Use Google Cloud Console to set up a new project.](google-cloud-console-new-project.png)

3. When your project is created, go to **APIs & Services** to search for and enable the following 2 services:

  - **Google Calendar API**: Used for anything related to the calendar and events.

  - **Google People API**: Used to link your Mattermost account to your Google account.

    ![In Google Cloud Console, select APIs & Services to search for services to enable.](google-cloud-console-apis.png)

    ![In Google Cloud Console, search for and enable the Google Calendar API.](enable-google-cloud-console-google-calendar-api.png)

    ![In Google Cloud Console, search for and enable the Google People API.](enable-google-cloud-console-google-people-api.png)

4. Choose how to configure and register the application by selecting the user type as **Internal** or **External**, then select **Create**.

    ![On the OAuth consent screen, configure and register the application as internal or external.](google-cloud-console-OAuth-consent-screen.png)

5. When prompted, set the following app information:
 
    - **App name**: `Google Calendar Mattermost Plugin`
    - **User support email** 
    - **Developer contact information**
    - Populate the remaining fields as needed.

    ![Configure the consent screen app name and user support email.](google-cloud-console-app-information.png)

    ![Configure the consent screen developer contact information.](google-cloud-console-developer-contact-information.png)

6. Under **Credentials**, create new OAuth 2.0 credentials by selecting **Create Credentials > OAuth client ID**.

  - Under **Application type**, select **Web Application**.
  - Under **Authorized redirect URIs** add `https://(MM_SITE_URL)/plugins/com.mattermost.gcal/oauth2/complete` and replace `MM_SITE_URL` with your Mattermost Server **Site URL**.

    ![Under Credentials, select Web application.](google-cloud-console-web-application.png)

    ![Configure the authorized redirect URI for Mattermost.](google-cloud-console-authorized-redirect-uris.png)

7. Once the OAuth client is created, make a copy of the **Client ID** and **Client Secret** values for the configuration step.

![Copy the Client ID and Client secret values. You'll need these values in the configuration step.](google-cloud-console-OAuth-client-created.png)

See the [Mattermost Google Calendar integration configuration]() documentation to configure the Mattermost Google Calendar integration.

## Get help

If you face any issues while installing the Mattermost Google Calendar plugin, you can either:

- Open a new issue in this [Mattermost Google Calendar GitHub repository](https://github.com/mattermost/mattermost-plugin-google-calendar/issues/new).
- Or, create a new topic in [our peer-to-peer troubleshooting forum](https://forum.mattermost.com/c/trouble-shoot/16).
