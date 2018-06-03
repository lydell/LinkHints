// @flow

const root = document.documentElement;

if (root != null) {
  const pre = document.createElement("pre");

  pre.textContent = JSON.stringify(
    {
      innerWidth: window.innerWidth,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offsetWidth: root.offsetWidth,
      innerHeight: window.innerHeight,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      offsetHeight: root.offsetHeight,
    },
    undefined,
    2
  );

  if (document.body != null) {
    document.body.append(pre);
  }
}
