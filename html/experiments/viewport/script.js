const { documentElement, body, scrollingElement } = document;

const pre = document.createElement("pre");
body.append(pre);

pre.textContent = JSON.stringify(
  {
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    documentElement: {
      clientWidth: documentElement.clientWidth,
      scrollWidth: documentElement.scrollWidth,
      offsetWidth: documentElement.offsetWidth,
      scrollLeftMax: documentElement.scrollLeftMax,
      clientHeight: documentElement.clientHeight,
      scrollHeight: documentElement.scrollHeight,
      offsetHeight: documentElement.offsetHeight,
      scrollTopMax: documentElement.scrollTopMax,
    },
    body: {
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      offsetWidth: body.offsetWidth,
      scrollLeftMax: body.scrollLeftMax,
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      offsetHeight: body.offsetHeight,
      scrollTopMax: body.scrollTopMax,
    },
    viewport: {
      width: scrollingElement.clientWidth,
      height: scrollingElement.clientHeight,
    },
  },
  undefined,
  2
);
