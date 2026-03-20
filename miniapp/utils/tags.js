const { request } = require('./request');

function listTags() {
  return request({
    url: '/tags',
    method: 'GET',
    auth: true
  });
}

function createTag(payload) {
  return request({
    url: '/tags',
    method: 'POST',
    data: payload,
    auth: true
  });
}

module.exports = {
  listTags,
  createTag
};
