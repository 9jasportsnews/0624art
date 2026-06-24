const headers = {
  'Content-Type': 'application/json; charset=utf-8',
};

/** Netlify 靜態模式：讓前端辨識不是本機 dashboard server */
export default async () => {
  return new Response(
    JSON.stringify({
      mode: 'netlify',
      running: false,
    }),
    { status: 200, headers },
  );
};
