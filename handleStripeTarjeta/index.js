"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Crear el cliente de DynamoDB con la región especificada
const ddbClient = new DynamoDBClient({ region: "eu-north-1" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { token, email, name, userPhoneID } = body;

    if (!token || !email || !name || !userPhoneID) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Token, email, nombre y uID son requeridos",
        }),
      };
    }

    // Crear el cliente en Stripe
    const customer = await stripe.customers.create({
      email: email,
      name: name,
      source: token, // Token de la tarjeta generada por Stripe.js/Elements
    });
    console.log("Cliente creado en Stripe:", customer.id);

    // Crear la suscripción
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      throw new Error(
        "STRIPE_PRICE_ID no está definido en variables de entorno."
      );
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
    });
    console.log("Suscripción creada en Stripe:", subscription.id);

    // Guardar los datos en DynamoDB
    const tableName = process.env.DYNAMO_TABLE;
    const params = {
      TableName: tableName,
      Item: {
        userPhoneID: userPhoneID,
        customerId: customer.id,
        subscriptionId: subscription.id,
        email: email,
        name: name,
        createdAt: new Date().toISOString(),
      },
    };

    await ddbDocClient.send(new PutCommand(params));
    console.log("Datos guardados en DynamoDB.");

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        customerId: customer.id,
        subscriptionId: subscription.id,
      }),
    };
  } catch (error) {
    console.error("Error al procesar el pago y/o suscripción:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno al crear el cliente o la suscripción",
      }),
    };
  }
};
