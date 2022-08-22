import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import cron from 'node-cron';

import axios from 'axios';
import { RateLimiter } from 'limiter';

// Login to Discord with your client's token

const raidChannelNames = ['vykas-hard', '1445-combo', '1430-combo', 'random-raids'];

const sendToChannelName = process.env.RAID_CHANNEL_NAME;
const token = process.env.DISCORD_TOKEN;
const serverName = process.env.SERVER_NAME;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const chunk = (arr: Array<any>, size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const limiter = new RateLimiter({ tokensPerInterval: 2, interval: 'second' });

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const reminder = async (cli: any) => {
  const now = Date.now();
  const server: any = cli.guilds.cache.find((s: any) => s.name === serverName);

  const members: Array<{ user: any; nickname: any }> =
    await server.members.fetch();

  const memberMap = members.reduce((acc, curr) => {
    if (curr && curr.user && curr.user.id) {
      acc[curr.user.id] = curr.user;
    }
    return acc;
  }, {} as Record<any, any>);

  const channel = server.channels.cache.find(
    (channel: any) => channel.name === sendToChannelName
  );

  const messageIds: any = [];

  try {
    await Promise.all(
      raidChannelNames.map(async (name) => {
        const raidChannel = server.channels.cache.find(
          (channel: any) => channel.name === name
        );
        const raidChannelMessages = await raidChannel.messages.fetch();

        const raidChannelMessagesIds: Array<number> = raidChannelMessages
          .filter(
            ({ author }: { author: any }) => author.username === 'Raid-Helper'
          )
          .map((r: any) => {
            const fields = r.embeds[0].data.fields;
            const timeValue = fields.find(({ value }: { value: string }) =>
              value.match(/CMcalendar/g)
            );
            const signUp = fields.find(({ value }: { value: string }) =>
              value.match(/signups/g)
            );
            const signUpNumber = Number(
              signUp.value.split(' ')[1].match(/[0-9]/g)[0]
            );
            const timeMS =
              Number(timeValue.value.split(' ')[1].match(/[0-9]/g).join('')) *
              1000;

            const timeDiff = timeMS - now;

            if (timeDiff <= 1800000 && timeDiff > 1500000 && signUpNumber > 0) {
              messageIds.push(r.id);
            }
          });
      })
    );
  } catch (err) {
    console.log({
      event: 'discord api error',
      errors: err,
    });
  }

  for (const raidId of messageIds) {
    let data = {} as any;
    try {
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests < 1) {
        await sleep(1000);
      }
      const r = await axios.get(`https://raid-helper.dev/api/event/${raidId}`);
      data = r.data;
    } catch (err) {
      console.log(err);
    }

    const { signups, title, description } = data;

    if (!signups || !signups.length) {
      continue;
    }
    const filteredSignups = signups.filter(
      (s: any) => ['Dps', 'Support'].includes(s.role) && !['Bench', 'Tentative'].includes(s.class)
    );

    if (!filteredSignups.length) {
      continue;
    }

    const text = `reminder upcoming raid ${title} ${description} in about ${30}ish minutes`;

    const foundUsers: Array<any> = [];
    const notFouncUsers: Array<any> = [];

    filteredSignups.forEach((obj: any) => {
      const u = memberMap[obj.userid];
      u ? foundUsers.push(`${u}`) : notFouncUsers.push(obj.name);
    });
    await channel.send(`${foundUsers.join(',')} ${text}`);
  }
};

client.login(token);

client.on('ready', async () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log(`starting Timestamp: ${new Date()}`);
    try {
      await reminder(client);
    } catch (error) {
      console.log(error);
    }
    console.log(`finishing Timestamp: ${new Date()}`);
  });
});
