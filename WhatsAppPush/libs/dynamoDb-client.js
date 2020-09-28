const AWS = require("aws-sdk");

const client = new AWS.DynamoDB.DocumentClient();

module.exports = {
  get: async (params) => await client.get(params).promise(),
  put: async (params) => await client.put(params).promise(),
  query: async (params) => await client.query(params).promise(),
  scan: async (params) => {
    let output;
    const items = [];
    do {
      output = await client.scan(params).promise();
      if (output.Items) {
        items.push(...output.Items);
      }
    } while (
      (params.ExclusiveStartKey = output.LastEvaluatedKey) &&
      (!params.Limit || params.Limit < items.length)
    );
    return {
      lastEvaluatedKey: output.LastEvaluatedKey,
      items,
    };
  },
  update: async (params) => await client.update(params).promise(),
  delete: async (params) => await client.delete(params).promise(),
};
