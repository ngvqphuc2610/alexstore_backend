import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /chat/conversations - Create or get existing conversation with a seller
   */
  @Post('conversations')
  async getOrCreateConversation(
    @Req() req: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.getOrCreateConversation(req.user.id, dto.sellerId);
  }

  /**
   * GET /chat/conversations - Get all conversations for the logged-in user
   */
  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getConversations(req.user.id);
  }

  /**
   * GET /chat/conversations/:id/messages - Get messages with cursor-based pagination
   */
  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(
      req.user.id,
      conversationId,
      cursor,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
