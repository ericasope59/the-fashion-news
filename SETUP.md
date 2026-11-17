# The Fashion News: setup guide

Time needed: about 15 minutes, once. After that the app updates itself every morning.

## 1. Create a free GitHub account
Go to https://github.com/signup and follow the steps. Choose the free plan.

## 2. Create the app's home (a "repository")
1. Signed in, go to https://github.com/new
2. Repository name: `the-fashion-news`
3. Choose **Public** (free hosting requires this; your saved stories and moodboard stay private on your phone).
4. Click **Create repository**.

## 3. Upload the app files
1. Unzip `the-fashion-news.zip` on your computer.
2. On the new repository page, click **uploading an existing file**.
3. Open the unzipped folder, select **everything inside it** (including the hidden `.github` folder; on Mac press Cmd+Shift+. in Finder to show it) and drag it into the browser.
4. Click **Commit changes**.

## 4. Switch on hosting
1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

## 5. Run the first update
1. Open the **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
2. Click **Daily update → Run workflow → Run workflow**.
3. Wait 3–5 minutes until it shows a green tick.

Your app is now live at: `https://YOUR-USERNAME.github.io/the-fashion-news/`

## 6. Put it on your phone
- **iPhone:** open the link in Safari → Share button → **Add to Home Screen**.
- **Android:** open the link in Chrome → ⋮ menu → **Install app** (or Add to Home screen).

It now opens full screen like any other app.

## What updates, and when
| Part | How often | Source |
|---|---|---|
| Headlines and excerpts | Every morning (~05:17 Paris) | Publishers' own feeds and Google News, credible outlets only |
| Look of the day photo | Every morning | The Met, Costume Institute (public domain) |
| Fabric of the day, Term of the day | Every morning | Wikipedia (text credited, CC BY-SA 4.0) |
| Events calendar | Past events move automatically; new events need adding | `data/events.json` |
| Inspire images | Live, every time you scroll or pull down | Openverse (incl. Flickr), Wikimedia Commons, The Met |

## Checking that it works
Actions tab → latest **Daily update** run → **Refresh news…** step shows which sources worked and which were skipped. A skipped source never breaks the app; the previous day's stories are kept if too few come in.

## Adding events
Open `data/events.json` on GitHub → pencil icon → copy an existing line, change the details, keep the same format → **Commit changes**. The app updates within minutes.
