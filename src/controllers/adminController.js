/**
 * 管理员控制器，处理产品和卡密管理功能
 */
const { Product } = require('../models/productModel');
const { Card } = require('../models/cardModel');
const { Order } = require('../models/orderModel');
const { cleanupPendingOrders } = require('../utils/orderCleanup');
const fs = require('fs');
const path = require('path');
const util = require('util');
const axios = require('axios');
// 为了支持文件下载，设置读取文件和创建临时目录的Promise
const writeFileAsync = util.promisify(fs.writeFile);
const mkdirAsync = util.promisify(fs.mkdir);
const readFileAsync = util.promisify(fs.readFile);
const unlinkAsync = util.promisify(fs.unlink);

// 存储用户状态
const userStates = {};
let botInstance = null;

/**
 * 初始化管理员控制器
 */
function initAdminController(bot) {
  botInstance = bot;
}

/**
 * 检查用户是否为管理员
 */
function isAdmin(userId, adminUserIds) {
  return adminUserIds.includes(userId.toString());
}

/**
 * 处理管理员权限检查
 */
async function checkAdmin(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  
  if (!isAdmin(userId, adminUserIds)) {
    await botInstance.sendMessage(chatId, '⚠️ 您没有权限访问管理员功能。');
    return false;
  }
  
  return true;
}

/**
 * 处理 /admin 命令
 */
async function handleAdmin(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  await botInstance.sendMessage(
    chatId,
    '🔧 *管理员控制面板*\n\n' +
    '请选择一个操作：',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 管理产品', callback_data: 'manage_products' }],
          [{ text: '🔑 管理卡密', callback_data: 'manage_cards' }],
          [{ text: '📋 查看订单', callback_data: 'manage_orders' }],
          [{ text: '🚫 用户管理', callback_data: 'manage_users' }],
          [{ text: '📊 系统统计', callback_data: 'view_stats' }]
        ]
      }
    }
  );
}

/**
 * 处理管理产品请求
 */
async function handleManageProducts(chatId, userId) {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    
    if (products.length === 0) {
      return botInstance.sendMessage(chatId, '🔍 暂无产品数据，请先添加产品。', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ 添加新产品', callback_data: 'add_product' }]
          ]
        }
      });
    }
    
    const inlineKeyboard = products.map(product => {
      const status = product.active ? '✅' : '❌';
      return [{ 
        text: `${status} ${product.name} - ¥${product.price}`, 
        callback_data: `edit_product_${product._id}` 
      }];
    });
    
    // 添加添加产品按钮
    inlineKeyboard.push([{ text: '➕ 添加新产品', callback_data: 'add_product' }]);
    
    await botInstance.sendMessage(
      chatId,
      '🛒 *产品管理*\n\n选择一个产品进行编辑或添加新产品：',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
  } catch (error) {
    console.error('获取产品列表时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品列表时出错，请稍后再试。');
  }
}

/**
 * 处理管理卡密请求
 */
async function handleManageCards(chatId, userId) {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    
    if (products.length === 0) {
      return botInstance.sendMessage(chatId, '🔍 暂无产品数据，请先添加产品。');
    }
    
    const inlineKeyboard = products.map(product => {
      return [{ 
        text: `${product.name}`, 
        callback_data: `manage_cards_${product._id}` 
      }];
    });
    
    await botInstance.sendMessage(
      chatId,
      '🔑 *卡密管理*\n\n选择一个产品进行卡密管理：',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
  } catch (error) {
    console.error('获取产品列表时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品列表时出错，请稍后再试。');
  }
}

/**
 * 处理产品卡密管理
 */
async function handleProductCards(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    // 获取该产品的卡密统计
    const totalCards = await Card.countDocuments({ productId });
    const usedCards = await Card.countDocuments({ productId, used: true });
    const unusedCards = await Card.countDocuments({ productId, used: false });
    
    const cardKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📥 导入卡密', callback_data: `import_cards_${productId}` }],
          [{ text: '📤 导出未使用卡密', callback_data: `export_cards_${productId}_unused` }],
          [{ text: '📤 导出全部卡密', callback_data: `export_cards_${productId}_all` }],
          [{ text: '🗑️ 删除全部卡密', callback_data: `delete_cards_${productId}` }],
          [{ text: '⬅️ 返回卡密管理', callback_data: 'manage_cards' }]
        ]
      }
    };
    
    await botInstance.sendMessage(
      chatId,
      `🔑 *${product.name} 的卡密管理*\n\n` +
      `卡密总数: ${totalCards}\n` +
      `已使用: ${usedCards}\n` +
      `未使用: ${unusedCards}\n\n` +
      `选择操作：`,
      {
        parse_mode: 'Markdown',
        ...cardKeyboard
      }
    );
  } catch (error) {
    console.error('获取产品卡密信息时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品卡密信息时出错，请稍后再试。');
  }
}

/**
 * 启动导入卡密流程
 */
async function startImportCards(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    // 设置用户状态为导入卡密
    const userData = userStates[userId] || {};
    userData.state = 'importing_cards';
    userData.productId = productId;
    userStates[userId] = userData;
    
    await botInstance.sendMessage(
      chatId,
      `📥 *导入卡密到 ${product.name}*\n\n` +
      `您可以通过以下两种方式导入卡密：\n\n` +
      `1️⃣ 直接发送文本消息，每行一个卡密\n` +
      `例如:\n` +
      `CARD-1234-5678\n` +
      `CARD-8765-4321\n\n` +
      `2️⃣ 上传TXT文本文件，每行一个卡密\n\n` +
      `注意：文本文件必须是UTF-8编码，每行一个卡密`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('启动导入卡密流程时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 操作失败，请稍后再试。');
  }
}

/**
 * 处理导出卡密
 */
async function handleExportCardsByProduct(chatId, userId, productId, type = 'unused') {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    // 查询条件
    const query = { productId };
    if (type === 'unused') {
      query.used = false;
    }
    
    // 查找卡密
    const cards = await Card.find(query);
    
    if (cards.length === 0) {
      return botInstance.sendMessage(chatId, '📤 没有找到符合条件的卡密。');
    }
    
    // 生成卡密文本
    let cardText = `${product.name} 的卡密列表:\n\n`;
    cards.forEach(card => {
      cardText += `${card.code} | ${card.used ? '已使用' : '未使用'}\n`;
    });
    
    // 如果卡密太多，分批发送
    if (cardText.length > 4000) {
      const chunks = [];
      let currentChunk = `${product.name} 的卡密列表 (1/${Math.ceil(cardText.length / 3000)}):\n\n`;
      
      cards.forEach(card => {
        const cardLine = `${card.code} | ${card.used ? '已使用' : '未使用'}\n`;
        
        if (currentChunk.length + cardLine.length > 3000) {
          chunks.push(currentChunk);
          currentChunk = `${product.name} 的卡密列表 (${chunks.length + 1}/${Math.ceil(cardText.length / 3000)}):\n\n`;
        }
        
        currentChunk += cardLine;
      });
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      
      // 逐个发送分块
      for (const chunk of chunks) {
        await botInstance.sendMessage(chatId, chunk);
      }
    } else {
      await botInstance.sendMessage(chatId, cardText);
    }
    
    // 返回卡密管理页面
    return handleProductCards(chatId, userId, productId);
  } catch (error) {
    console.error('导出卡密时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 导出卡密时出错，请稍后再试。');
  }
}

/**
 * 启动添加产品过程
 */
async function startAddProduct(chatId, userId) {
  // 创建一个对话状态来收集产品信息
  const userData = userStates[userId] || {};
  userData.state = 'adding_product';
  userData.productData = {};
  userData.step = 'name';
  userStates[userId] = userData;
  
  await botInstance.sendMessage(
    chatId,
    '➕ *添加新产品*\n\n' +
    '请输入产品名称：',
    { parse_mode: 'Markdown' }
  );
}

/**
 * 根据ID编辑产品
 */
async function handleEditProductById(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    const activeStatus = product.active ? '✅ 活跃' : '❌ 停用';
    
    const editKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ 编辑名称', callback_data: `edit_name_${productId}` }],
          [{ text: '✏️ 编辑描述', callback_data: `edit_desc_${productId}` }],
          [{ text: '✏️ 编辑价格', callback_data: `edit_price_${productId}` }],
          [{ text: `${activeStatus}`, callback_data: `toggle_product_${productId}` }],
          [{ text: '🗑️ 删除产品', callback_data: `delete_product_${productId}` }],
          [{ text: '⬅️ 返回产品管理', callback_data: 'manage_products' }]
        ]
      }
    };
    
    await botInstance.sendMessage(
      chatId,
      `✏️ *编辑产品*\n\n` +
      `产品ID: ${product._id}\n` +
      `名称: ${product.name}\n` +
      `描述: ${product.description}\n` +
      `价格: ¥${product.price}\n` +
      `状态: ${activeStatus}\n\n` +
      `选择要编辑的项目：`,
      {
        parse_mode: 'Markdown',
        ...editKeyboard
      }
    );
  } catch (error) {
    console.error('获取产品详情时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品详情时出错，请稍后再试。');
  }
}

/**
 * 切换产品状态
 */
async function toggleProductStatus(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    // 切换状态
    product.active = !product.active;
    await product.save();
    
    const statusText = product.active ? '✅ 已激活' : '❌ 已停用';
    await botInstance.sendMessage(chatId, `${statusText}产品: ${product.name}`);
    
    // 返回编辑页面
    return handleEditProductById(chatId, userId, productId);
    
  } catch (error) {
    console.error('切换产品状态时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 切换产品状态时出错，请稍后再试。');
  }
}

/**
 * 确认添加产品
 */
async function confirmAddProduct(chatId, userId, callbackQueryId) {
  const userData = userStates[userId];
  if (!userData || userData.state !== 'adding_product' || userData.step !== 'confirm') {
    return;
  }
  
  try {
    // 创建新产品
    const newProduct = new Product({
      name: userData.productData.name,
      description: userData.productData.description,
      price: userData.productData.price,
      active: true
    });
    
    await newProduct.save();
    
    // 清除用户状态
    delete userStates[userId];
    
    await botInstance.answerCallbackQuery(callbackQueryId, { text: '产品添加成功！' });
    await botInstance.sendMessage(
      chatId,
      `✅ 产品添加成功！\n\n` +
      `名称: ${newProduct.name}\n` +
      `价格: ¥${newProduct.price}`
    );
    
    // 返回产品管理
    return handleManageProducts(chatId, userId);
    
  } catch (error) {
    console.error('添加产品时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 添加产品时出错，请稍后再试。');
  }
}

/**
 * 取消添加产品
 */
async function cancelAddProduct(chatId, userId, callbackQueryId) {
  // 清除用户状态
  delete userStates[userId];
  
  await botInstance.answerCallbackQuery(callbackQueryId, { text: '已取消添加产品' });
  await botInstance.sendMessage(chatId, '❌ 已取消添加产品。');
  
  // 返回产品管理
  return handleManageProducts(chatId, userId);
}

/**
 * 处理 /stats 命令
 */
async function handleStats(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  
  try {
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ active: true });
    const totalCards = await Card.countDocuments();
    const usedCards = await Card.countDocuments({ used: true });
    const availableCards = await Card.countDocuments({ used: false });
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const expiredOrders = await Order.countDocuments({ status: 'expired' });
    const completedOrders = await Order.countDocuments({ status: 'delivered' });
    
    // 获取各商品的库存详情
    const products = await Product.find({ active: true });
    let stockDetails = '';
    
    for (const product of products) {
      const stockCount = await Card.countDocuments({ 
        productId: product._id, 
        used: false 
      });
      const stockStatus = stockCount > 0 ? '✅' : '❌';
      stockDetails += `${stockStatus} ${product.name}: ${stockCount}张\n`;
    }
    
    const statsMessage = 
      '📊 *系统统计信息*\n\n' +
      `🛒 产品数量：${activeProducts}/${totalProducts}\n` +
      `🔑 卡密总量：${totalCards}张\n` +
      `✅ 可用卡密：${availableCards}张\n` +
      `❌ 已用卡密：${usedCards}张\n` +
      `📃 订单总量：${totalOrders}\n` +
      `⏳ 待处理订单：${pendingOrders}\n` +
      `⌛ 已过期订单：${expiredOrders}\n` +
      `✅ 已完成订单：${completedOrders}\n\n` +
      (stockDetails ? `📦 *各商品库存详情*\n${stockDetails}` : '');
    
    await botInstance.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('获取统计信息时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取统计信息时出错，请稍后再试。');
  }
}

/**
 * 添加新产品处理函数
 */
async function handleAddProduct(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  
  // 启动添加产品过程
  startAddProduct(chatId, userId);
}

/**
 * 编辑产品处理函数
 */
async function handleEditProduct(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    
    if (products.length === 0) {
      return botInstance.sendMessage(chatId, '❌ 没有可编辑的产品，请先添加产品。');
    }
    
    const inlineKeyboard = products.map(product => {
      const status = product.active ? '✅' : '❌';
      return [{ text: `${status} ${product.name}`, callback_data: `edit_product_${product._id}` }];
    });
    
    await botInstance.sendMessage(
      chatId,
      '✏️ *编辑产品*\n\n请选择要编辑的产品：',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
  } catch (error) {
    console.error('获取产品列表时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品列表时出错，请稍后再试。');
  }
}

/**
 * 导入卡密处理函数
 */
async function handleImportCards(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    
    if (products.length === 0) {
      return botInstance.sendMessage(chatId, '❌ 没有产品，请先添加产品。');
    }
    
    const inlineKeyboard = products.map(product => {
      return [{ text: product.name, callback_data: `import_cards_${product._id}` }];
    });
    
    await botInstance.sendMessage(
      chatId,
      '📥 *导入卡密*\n\n选择要导入卡密的产品：',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
  } catch (error) {
    console.error('获取产品列表时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品列表时出错，请稍后再试。');
  }
}

/**
 * 导出卡密处理函数
 */
async function handleExportCards(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    
    if (products.length === 0) {
      return botInstance.sendMessage(chatId, '❌ 没有产品，请先添加产品。');
    }
    
    const inlineKeyboard = products.map(product => {
      return [{ text: product.name, callback_data: `export_cards_${product._id}_unused` }];
    });
    
    await botInstance.sendMessage(
      chatId,
      '📤 *导出卡密*\n\n选择要导出卡密的产品：',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
  } catch (error) {
    console.error('获取产品列表时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取产品列表时出错，请稍后再试。');
  }
}

/**
 * 处理订单管理页面
 */
async function handleManageOrders(chatId, userId, page = 1, status = 'all') {
  try {
    const pageSize = 5; // 每页显示订单数量
    const skip = (page - 1) * pageSize;
    
    // 查询条件
    const query = {};
    if (status !== 'all') {
      query.status = status;
    }
    
    // 获取总订单数
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / pageSize);
    
    // 调整页码
    page = Math.max(1, Math.min(page, totalPages || 1));
    
    // 获取订单数据
    const orders = await Order.find(query)
      .populate('productId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);
    
    if (orders.length === 0) {
      return botInstance.sendMessage(
        chatId,
        '📋 没有找到符合条件的订单。',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ 返回', callback_data: 'admin' }]
            ]
          }
        }
      );
    }
    
    // 构建订单信息
    let message = `📋 *订单列表*  (${page}/${totalPages})\n\n`;
    
    for (const order of orders) {
      const statusEmoji = getStatusEmoji(order.status);
      const productName = order.productId ? order.productId.name : '未知产品';
      const dateStr = formatDate(order.createdAt);
      
      message += `订单ID: \`${order._id}\`\n`;
      message += `用户ID: \`${order.userId}\`\n`;
      message += `产品: ${productName}\n`;
      message += `金额: ¥${order.amount}\n`;
      message += `状态: ${statusEmoji} ${order.status}\n`;
      message += `创建时间: ${dateStr}\n\n`;
    }
    
    // 构建分页和筛选按钮
    const keyboard = [];
    
    // 状态筛选按钮
    const statusButtons = [
      { text: status === 'all' ? '✅ 全部' : '全部', callback_data: `orders_filter_all_${page}` },
      { text: status === 'pending' ? '✅ 待支付' : '待支付', callback_data: `orders_filter_pending_${page}` },
      { text: status === 'delivered' ? '✅ 已完成' : '已完成', callback_data: `orders_filter_delivered_${page}` },
      { text: status === 'expired' ? '✅ 已过期' : '已过期', callback_data: `orders_filter_expired_${page}` }
    ];
    
    keyboard.push(statusButtons);
    
    // 分页按钮
    const paginationButtons = [];
    if (page > 1) {
      paginationButtons.push({ text: '⬅️ 上一页', callback_data: `orders_page_${page-1}_${status}` });
    }
    if (page < totalPages) {
      paginationButtons.push({ text: '➡️ 下一页', callback_data: `orders_page_${page+1}_${status}` });
    }
    
    if (paginationButtons.length > 0) {
      keyboard.push(paginationButtons);
    }
    
    // 返回按钮
    keyboard.push([{ text: '⬅️ 返回管理菜单', callback_data: 'admin' }]);
    
    await botInstance.sendMessage(
      chatId,
      message,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
  } catch (error) {
    console.error('获取订单列表时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取订单列表时出错，请稍后再试。');
  }
}

/**
 * 处理用户管理页面
 */
async function handleManageUsers(chatId, userId, page = 1) {
  try {
    const { Blacklist } = require('../models/blacklistModel');
    
    // 获取黑名单用户
    const pageSize = 5;
    const skip = (page - 1) * pageSize;
    
    const totalBlacklisted = await Blacklist.countDocuments();
    const totalPages = Math.ceil(totalBlacklisted / pageSize) || 1;
    
    // 调整页码
    page = Math.max(1, Math.min(page, totalPages));
    
    const blacklistedUsers = await Blacklist.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);
    
    let message = '🚫 *用户黑名单管理*\n\n';
    
    if (blacklistedUsers.length === 0) {
      message += '目前没有被拉黑的用户。';
    } else {
      message += `当前黑名单用户: ${totalBlacklisted}人\n\n`;
      
      for (const user of blacklistedUsers) {
        const remainingTime = Math.max(0, Math.floor((user.banUntil - new Date()) / (1000 * 60 * 60)));
        message += `用户ID: \`${user.userId}\`\n`;
        message += `原因: ${user.reason}\n`;
        message += `封禁次数: ${user.banCount}次\n`;
        message += `剩余时间: ${remainingTime}小时\n\n`;
      }
    }
    
    // 构建分页按钮
    const keyboard = [];
    
    // 如果有黑名单用户，为每个用户添加解除拉黑按钮
    if (blacklistedUsers.length > 0) {
      for (const user of blacklistedUsers) {
        keyboard.push([
          { text: `🔓 解除拉黑 ${user.userId}`, callback_data: `unblacklist_user_${user.userId}` }
        ]);
      }
      keyboard.push([]);  // 添加一个空行作为分隔
    }
    
    // 分页按钮
    const paginationButtons = [];
    if (page > 1) {
      paginationButtons.push({ text: '⬅️ 上一页', callback_data: `users_page_${page-1}` });
    }
    if (page < totalPages) {
      paginationButtons.push({ text: '➡️ 下一页', callback_data: `users_page_${page+1}` });
    }
    
    if (paginationButtons.length > 0) {
      keyboard.push(paginationButtons);
    }
    
    // 操作按钮
    keyboard.push([{ text: '🚫 手动拉黑用户', callback_data: 'blacklist_user' }]);
    
    // 返回按钮
    keyboard.push([{ text: '⬅️ 返回管理菜单', callback_data: 'admin' }]);
    
    await botInstance.sendMessage(
      chatId,
      message,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
  } catch (error) {
    console.error('获取黑名单用户时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 获取黑名单用户时出错，请稍后再试。');
  }
}

/**
 * 启动添加黑名单流程
 */
async function startBlacklistUser(chatId, userId) {
  try {
    // 设置用户状态
    const userData = userStates[userId] || {};
    userData.state = 'blacklisting_user';
    userData.step = 'user_id';
    userStates[userId] = userData;
    
    await botInstance.sendMessage(
      chatId,
      '🚫 *拉黑用户*\n\n' +
      '请输入要拉黑的用户ID (Telegram用户ID)：',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('启动拉黑用户流程时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 操作失败，请稍后再试。');
  }
}

/**
 * 处理取消拉黑用户
 */
async function handleUnblacklistUser(chatId, userId, targetUserId) {
  try {
    const { Blacklist } = require('../models/blacklistModel');
    
    const result = await Blacklist.unbanUser(targetUserId);
    
    if (result) {
      await botInstance.sendMessage(
        chatId,
        `✅ 已成功将用户 \`${targetUserId}\` 从黑名单中移除。`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await botInstance.sendMessage(
        chatId,
        `❌ 用户 \`${targetUserId}\` 不在黑名单中。`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // 返回用户管理页面
    return handleManageUsers(chatId, userId);
  } catch (error) {
    console.error('解除拉黑用户时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 解除拉黑用户时出错，请稍后再试。');
  }
}

// 辅助函数：获取状态emoji
function getStatusEmoji(status) {
  switch (status) {
    case 'pending': return '⏳';
    case 'paid': return '💰';
    case 'failed': return '❌';
    case 'delivered': return '✅';
    case 'expired': return '⌛';
    default: return '❓';
  }
}

// 辅助函数：格式化日期
function formatDate(date) {
  return new Date(date).toLocaleString();
}

/**
 * 处理管理员相关的回调查询
 */
async function handleAdminCallbacks(callbackQuery, adminUserIds) {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id.toString();
  
  // 检查是否为管理员
  if (!isAdmin(userId, adminUserIds)) {
    await botInstance.answerCallbackQuery(callbackQuery.id, { text: '无权限' });
    await botInstance.sendMessage(chatId, '⚠️ 您没有权限访问管理功能。');
    return true; // 已处理
  }
  
  // 先应答回调查询，移除加载状态
  await botInstance.answerCallbackQuery(callbackQuery.id);
  
  try {
    // 处理返回管理员菜单
    if (action === 'admin') {
      await handleAdmin({ chat: { id: chatId }, from: { id: userId } }, adminUserIds);
      return true;
    }
    
    // 处理管理产品
    if (action === 'manage_products') {
      await handleManageProducts(chatId, userId);
      return true;
    }
    
    // 处理管理卡密
    if (action === 'manage_cards') {
      await handleManageCards(chatId, userId);
      return true;
    }
    
    // 处理管理订单
    if (action === 'manage_orders') {
      await handleManageOrders(chatId, userId);
      return true;
    }
    
    // 处理订单分页
    if (action.startsWith('orders_page_')) {
      const parts = action.split('_');
      const page = parseInt(parts[2]);
      const status = parts[3] || 'all';
      await handleManageOrders(chatId, userId, page, status);
      return true;
    }
    
    // 处理订单状态筛选
    if (action.startsWith('orders_filter_')) {
      const parts = action.split('_');
      const status = parts[2];
      const page = parseInt(parts[3]) || 1;
      await handleManageOrders(chatId, userId, page, status);
      return true;
    }
    
    // 处理用户管理
    if (action === 'manage_users') {
      await handleManageUsers(chatId, userId);
      return true;
    }
    
    // 处理用户分页
    if (action.startsWith('users_page_')) {
      const page = parseInt(action.split('_')[2]);
      await handleManageUsers(chatId, userId, page);
      return true;
    }
    
    // 处理拉黑用户
    if (action === 'blacklist_user') {
      await startBlacklistUser(chatId, userId);
      return true;
    }
    
    // 处理取消拉黑用户
    if (action.startsWith('unblacklist_user_')) {
      const targetUserId = action.split('_')[2];
      await handleUnblacklistUser(chatId, userId, targetUserId);
      return true;
    }
    
    // 处理统计信息
    if (action === 'view_stats') {
      await handleStats({ chat: { id: chatId }, from: { id: userId } }, adminUserIds);
      return true;
    }
    
    // 处理添加产品
    if (action === 'add_product') {
      await startAddProduct(chatId, userId);
      return true;
    }
    
    // 处理编辑产品
    if (action.startsWith('edit_product_')) {
      const productId = action.split('_')[2];
      await handleEditProductById(chatId, userId, productId);
      return true;
    }
    
    // 处理删除产品
    if (action.startsWith('delete_product_')) {
      const productId = action.split('_')[2];
      await handleDeleteProduct(chatId, userId, productId);
      return true;
    }
    
    // 处理确认删除产品
    if (action.startsWith('confirm_delete_product_')) {
      const productId = action.split('_')[3];
      await confirmDeleteProduct(chatId, userId, productId);
      return true;
    }
    
    // 处理切换产品状态
    if (action.startsWith('toggle_product_')) {
      const productId = action.split('_')[2];
      await toggleProductStatus(chatId, userId, productId);
      return true;
    }
    
    // 处理卡密管理
    if (action.startsWith('manage_cards_')) {
      const productId = action.split('_')[2];
      await handleProductCards(chatId, userId, productId);
      return true;
    }
    
    // 处理导入卡密
    if (action.startsWith('import_cards_')) {
      const productId = action.split('_')[2];
      await startImportCards(chatId, userId, productId);
      return true;
    }
    
    // 处理导出卡密
    if (action.startsWith('export_cards_')) {
      const parts = action.split('_');
      const productId = parts[2];
      const type = parts[3] || 'unused';
      await handleExportCardsByProduct(chatId, userId, productId, type);
      return true;
    }
    
    // 处理删除卡密
    if (action.startsWith('delete_cards_')) {
      const productId = action.split('_')[2];
      await handleDeleteCards(chatId, userId, productId);
      return true;
    }
    
    // 处理确认删除卡密
    if (action.startsWith('confirm_delete_cards_')) {
      const parts = action.split('_');
      const productId = parts[3];
      const type = parts[4] || 'all';
      await confirmDeleteCards(chatId, userId, productId, type);
      return true;
    }
    
    // 处理确认添加产品
    if (action === 'confirm_add_product') {
      await confirmAddProduct(chatId, userId, callbackQuery.id);
      return true;
    }
    
    // 处理取消添加产品
    if (action === 'cancel_add_product') {
      await cancelAddProduct(chatId, userId, callbackQuery.id);
      return true;
    }
    
    return false; // 不是管理员回调
  } catch (error) {
    console.error('处理管理员回调时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 操作失败，请稍后再试。');
    return true; // 已处理，避免进一步处理
  }
}

/**
 * 处理管理员文本消息
 */
async function handleAdminTextMessage(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  
  // 检查是否为管理员
  if (!isAdmin(userId, adminUserIds)) {
    return false;
  }
  
  const chatId = msg.chat.id;
  const userData = userStates[userId];
  
  if (!userData) return false; // 没有进行中的操作
  
  // 处理拉黑用户流程
  if (userData.state === 'blacklisting_user') {
    switch (userData.step) {
      case 'user_id':
        const targetUserId = msg.text.trim();
        if (!/^\d+$/.test(targetUserId)) {
          await botInstance.sendMessage(chatId, '❌ 用户ID必须是数字，请重新输入：');
          return true;
        }
        
        userData.targetUserId = targetUserId;
        userData.step = 'reason';
        await botInstance.sendMessage(chatId, '请输入拉黑原因：');
        return true;
        
      case 'reason':
        const reason = msg.text.trim();
        if (!reason) {
          await botInstance.sendMessage(chatId, '❌ 原因不能为空，请重新输入：');
          return true;
        }
        
        userData.reason = reason;
        userData.step = 'duration';
        await botInstance.sendMessage(
          chatId,
          '请输入封禁时长（小时）\n默认为12小时：'
        );
        return true;
        
      case 'duration':
        let hours = 12;
        if (msg.text.trim()) {
          hours = parseInt(msg.text.trim());
          if (isNaN(hours) || hours <= 0) {
            await botInstance.sendMessage(chatId, '❌ 时长必须是正整数，请重新输入：');
            return true;
          }
        }
        
        // 执行拉黑操作
        try {
          const { Blacklist } = require('../models/blacklistModel');
          await Blacklist.banUser(userData.targetUserId, userData.reason, hours);
          
          await botInstance.sendMessage(
            chatId,
            `✅ 已成功将用户 \`${userData.targetUserId}\` 拉黑 ${hours} 小时\n原因: ${userData.reason}`,
            { parse_mode: 'Markdown' }
          );
          
          // 尝试向被拉黑用户发送通知
          try {
            await botInstance.sendMessage(
              userData.targetUserId,
              `⚠️ *您已被管理员暂时禁止使用本服务*\n\n` +
              `原因: ${userData.reason}\n` +
              `解封时间: ${new Date(Date.now() + hours * 60 * 60 * 1000).toLocaleString()}\n\n` +
              `如有疑问，请联系管理员。`,
              { parse_mode: 'Markdown' }
            );
          } catch (notifyError) {
            console.error('无法向用户发送拉黑通知:', notifyError);
          }
          
          // 清除状态
          delete userStates[userId];
          
          // 返回用户管理页面
          await handleManageUsers(chatId, userId);
          
        } catch (error) {
          console.error('拉黑用户时出错:', error);
          await botInstance.sendMessage(chatId, '❌ 拉黑用户时出错，请稍后再试。');
          delete userStates[userId];
        }
        
        return true;
    }
  }
  
  // 处理添加产品的各个步骤
  if (userData.state === 'adding_product') {
    switch (userData.step) {
      case 'name':
        userData.productData.name = msg.text;
        userData.step = 'description';
        await botInstance.sendMessage(chatId, '请输入产品描述：');
        return true;
      
      case 'description':
        userData.productData.description = msg.text;
        userData.step = 'price';
        await botInstance.sendMessage(chatId, '请输入产品价格（数字）：');
        return true;
      
      case 'price':
        const price = parseFloat(msg.text);
        if (isNaN(price) || price <= 0) {
          await botInstance.sendMessage(chatId, '❌ 价格格式错误，请输入有效的数字：');
          return true;
        }
        
        userData.productData.price = price;
        userData.step = 'confirm';
        
        await botInstance.sendMessage(
          chatId,
          `✅ *请确认产品信息*\n\n` +
          `名称: ${userData.productData.name}\n` +
          `描述: ${userData.productData.description}\n` +
          `价格: ¥${userData.productData.price}\n\n` +
          `是否添加该产品？`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ 确认添加', callback_data: 'confirm_add_product' },
                  { text: '❌ 取消', callback_data: 'cancel_add_product' }
                ]
              ]
            }
          }
        );
        return true;
    }
  }
  
  // 处理导入卡密 - 文本消息方式
  if (userData.state === 'importing_cards' && msg.text) {
    const productId = userData.productId;
    const cardLines = msg.text.split('\n').filter(line => line.trim() !== '');
    
    if (cardLines.length === 0) {
      await botInstance.sendMessage(chatId, '❌ 未检测到有效卡密，请重新发送。');
      return true;
    }
    
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        await botInstance.sendMessage(chatId, '❌ 找不到关联产品，导入失败。');
        delete userStates[userId];
        return true;
      }
      
      // 检查卡密是否已存在
      const existingCodes = new Set(
        (await Card.find({ code: { $in: cardLines } }).select('code')).map(card => card.code)
      );
      
      // 筛选出未存在的卡密
      const newCards = cardLines
        .filter(code => !existingCodes.has(code))
        .map(code => ({
          productId,
          code,
          used: false
        }));
      
      if (newCards.length === 0) {
        await botInstance.sendMessage(chatId, '❌ 所有卡密都已存在，未导入任何卡密。');
      } else {
        // 批量插入卡密
        await Card.insertMany(newCards);
        
        await botInstance.sendMessage(
          chatId,
          `✅ 卡密导入成功！\n\n` +
          `产品: ${product.name}\n` +
          `导入数量: ${newCards.length}/${cardLines.length}\n` +
          `已存在/跳过: ${cardLines.length - newCards.length}`
        );
      }
      
      // 清除状态
      delete userStates[userId];
      
      // 返回卡密管理 - 这里不使用return，避免重复返回
      await handleProductCards(chatId, userId, productId);
      return true;
      
    } catch (error) {
      console.error('导入卡密时出错:', error);
      await botInstance.sendMessage(chatId, '❌ 导入卡密时出错，请稍后再试。');
      delete userStates[userId];
      return true;
    }
  }
  
  return false; // 不是管理员操作
}

/**
 * 处理文件上传 - 导入卡密
 */
async function processFileUpload(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  
  // 检查是否为管理员
  if (!isAdmin(userId, adminUserIds)) {
    return false;
  }
  
  const chatId = msg.chat.id;
  const userData = userStates[userId];
  
  if (!userData || userData.state !== 'importing_cards') {
    return false; // 不是在导入卡密状态
  }
  
  // 检查是否有文件
  if (!msg.document) {
    return false;
  }
  
  try {
    // 获取文件扩展名
    const fileName = msg.document.file_name;
    const fileExt = path.extname(fileName).toLowerCase();
    
    // 只接受txt文件
    if (fileExt !== '.txt') {
      await botInstance.sendMessage(
        chatId, 
        '❌ 不支持的文件格式，请上传TXT文本文件。'
      );
      return true;
    }
    
    await botInstance.sendMessage(chatId, '⏳ 正在处理文件，请稍候...');
    
    // 获取文件信息
    const fileId = msg.document.file_id;
    const fileInfo = await botInstance.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
    
    // 创建临时目录（如果不存在）
    const tempDir = path.join(__dirname, '../../temp');
    try {
      await mkdirAsync(tempDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    
    // 下载文件到临时目录
    const tempFilePath = path.join(tempDir, `${userId}_${Date.now()}.txt`);
    
    // 下载文件
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'arraybuffer'
    });
    
    // 写入文件
    await writeFileAsync(tempFilePath, response.data);
    
    // 读取文件内容
    const fileContent = await readFileAsync(tempFilePath, 'utf8');
    
    // 删除临时文件
    try {
      await unlinkAsync(tempFilePath);
    } catch (error) {
      console.error('删除临时文件时出错:', error);
      // 继续执行，不中断流程
    }
    
    // 处理卡密导入
    const productId = userData.productId;
    const cardLines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    if (cardLines.length === 0) {
      await botInstance.sendMessage(chatId, '❌ 文件中未检测到有效卡密，请检查文件内容。');
      return true;
    }
    
    const product = await Product.findById(productId);
    
    if (!product) {
      await botInstance.sendMessage(chatId, '❌ 找不到关联产品，导入失败。');
      delete userStates[userId];
      return true;
    }
    
    // 检查卡密是否已存在
    const existingCodes = new Set(
      (await Card.find({ code: { $in: cardLines } }).select('code')).map(card => card.code)
    );
    
    // 筛选出未存在的卡密
    const newCards = cardLines
      .filter(code => !existingCodes.has(code))
      .map(code => ({
        productId,
        code,
        used: false
      }));
    
    if (newCards.length === 0) {
      await botInstance.sendMessage(chatId, '❌ 所有卡密都已存在，未导入任何卡密。');
    } else {
      // 批量插入卡密
      await Card.insertMany(newCards);
      
      await botInstance.sendMessage(
        chatId,
        `✅ 卡密导入成功！\n\n` +
        `产品: ${product.name}\n` +
        `导入数量: ${newCards.length}/${cardLines.length}\n` +
        `已存在/跳过: ${cardLines.length - newCards.length}`
      );
    }
    
    // 清除状态
    delete userStates[userId];
    
    // 返回卡密管理
    await handleProductCards(chatId, userId, productId);
    return true;
    
  } catch (error) {
    console.error('处理文件上传时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 处理文件时出错，请稍后再试: ' + error.message);
    delete userStates[userId];
    return true;
  }
}

/**
 * 手动清理过期订单
 */
async function handleCleanupOrders(msg, adminUserIds) {
  const userId = msg.from.id.toString();
  if (!isAdmin(userId, adminUserIds)) return;
  
  const chatId = msg.chat.id;
  
  try {
    await botInstance.sendMessage(chatId, '🔄 正在清理超时订单...');
    
    // 默认超时时间为30分钟
    const result = await cleanupPendingOrders(30);
    
    if (result.count === 0) {
      await botInstance.sendMessage(chatId, '✅ 没有发现需要清理的超时订单。');
    } else {
      await botInstance.sendMessage(
        chatId,
        `✅ 清理完成，共处理 ${result.count} 个超时订单。\n\n` +
        `这些订单已被标记为"expired"状态。`
      );
    }
  } catch (error) {
    console.error('手动清理订单时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 清理订单时出错，请稍后再试。');
  }
}

/**
 * 删除产品
 */
async function handleDeleteProduct(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    // 检查是否有关联的订单
    const orderCount = await Order.countDocuments({ productId });
    
    if (orderCount > 0) {
      // 如果有订单，提供确认选项
      await botInstance.sendMessage(
        chatId,
        `⚠️ *警告*\n\n` +
        `产品"${product.name}"有 ${orderCount} 个关联订单。\n` +
        `删除该产品将导致这些订单无法正常显示。\n\n` +
        `您确定要删除吗？`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ 确认删除', callback_data: `confirm_delete_product_${productId}` },
                { text: '❌ 取消', callback_data: `edit_product_${productId}` }
              ]
            ]
          }
        }
      );
      return;
    }
    
    // 如果没有订单，直接执行删除操作
    await confirmDeleteProduct(chatId, userId, productId);
    
  } catch (error) {
    console.error('删除产品时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 删除产品时出错，请稍后再试。');
  }
}

/**
 * 确认删除产品
 */
async function confirmDeleteProduct(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    const productName = product.name;
    
    // 删除产品关联的卡密
    const deleteCardsResult = await Card.deleteMany({ productId });
    
    // 删除产品
    await Product.findByIdAndDelete(productId);
    
    await botInstance.sendMessage(
      chatId,
      `✅ 产品"${productName}"已删除\n` +
      `同时删除了 ${deleteCardsResult.deletedCount} 个关联卡密`
    );
    
    // 返回产品管理
    return handleManageProducts(chatId, userId);
    
  } catch (error) {
    console.error('确认删除产品时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 删除产品时出错，请稍后再试。');
  }
}

/**
 * 删除卡密
 */
async function handleDeleteCards(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    // 获取该产品的卡密统计
    const totalCards = await Card.countDocuments({ productId });
    
    if (totalCards === 0) {
      return botInstance.sendMessage(
        chatId,
        `❌ 产品"${product.name}"没有卡密可删除。`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ 返回卡密管理', callback_data: `manage_cards_${productId}` }]
            ]
          }
        }
      );
    }
    
    const usedCards = await Card.countDocuments({ productId, used: true });
    const unusedCards = await Card.countDocuments({ productId, used: false });
    
    await botInstance.sendMessage(
      chatId,
      `⚠️ *删除卡密确认*\n\n` +
      `产品: ${product.name}\n` +
      `总计: ${totalCards} 个卡密\n` +
      `已用: ${usedCards} 个\n` +
      `未用: ${unusedCards} 个\n\n` +
      `请选择要删除的卡密类型:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑️ 删除全部卡密', callback_data: `confirm_delete_cards_${productId}_all` }],
            [{ text: '🗑️ 仅删除已使用卡密', callback_data: `confirm_delete_cards_${productId}_used` }],
            [{ text: '🗑️ 仅删除未使用卡密', callback_data: `confirm_delete_cards_${productId}_unused` }],
            [{ text: '❌ 取消', callback_data: `manage_cards_${productId}` }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('处理删除卡密时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 处理删除卡密时出错，请稍后再试。');
  }
}

/**
 * 确认删除卡密
 */
async function confirmDeleteCards(chatId, userId, productId, type = 'all') {
  try {
    const product = await Product.findById(productId);
    
    if (!product) {
      return botInstance.sendMessage(chatId, '❌ 找不到该产品。');
    }
    
    let query = { productId };
    let typeText = '所有';
    
    if (type === 'used') {
      query.used = true;
      typeText = '已使用的';
    } else if (type === 'unused') {
      query.used = false;
      typeText = '未使用的';
    }
    
    // 删除卡密
    const result = await Card.deleteMany(query);
    
    await botInstance.sendMessage(
      chatId,
      `✅ 已成功删除${typeText}卡密\n\n` +
      `产品: ${product.name}\n` +
      `删除数量: ${result.deletedCount} 个卡密`
    );
    
    // 返回卡密管理
    return handleProductCards(chatId, userId, productId);
    
  } catch (error) {
    console.error('确认删除卡密时出错:', error);
    await botInstance.sendMessage(chatId, '❌ 删除卡密时出错，请稍后再试。');
  }
}

module.exports = {
  initAdminController,
  isAdmin,
  checkAdmin,
  handleAdmin,
  handleAddProduct,
  handleEditProduct,
  handleImportCards,
  handleExportCards,
  handleStats,
  handleAdminCallbacks,
  handleAdminTextMessage,
  handleCleanupOrders,
  processFileUpload,
  handleDeleteProduct,
  confirmDeleteProduct,
  handleDeleteCards,
  confirmDeleteCards,
  handleManageOrders,
  handleManageUsers,
  startBlacklistUser,
  handleUnblacklistUser
}; 