# AlexStore Backend 

- **Framework**: [NestJS](https://nestjs.com/) (v11+)
- **ORM**: [Prisma](https://www.prisma.io/) (v7.4+)
- **Database**: MySQL
- **Authentication**: JWT (Passport-JWT)
- **Password Hashing**: Bcrypt
- **ID Generation**: UUID v7 (binary 16-byte)

##  Tính năng nổi bật

- **Kiến trúc Clean Code**: Chia tầng rõ ràng (Controller → Service → Prisma).
- **UUID v7**: Sử dụng UUID v7 sinh ở backend để đảm bảo sắp xếp theo thời gian và hiệu năng index tốt hơn UUID v4.
- **Authentication & PBAC**: Đăng ký, đăng nhập và phân quyền dựa trên Role (ADMIN, SELLER, BUYER).
- **Giao dịch an toàn (Transactions)**:
  - **Đặt hàng**: Kiểm tra tồn kho, trừ kho và tạo đơn hàng đồng bộ (atomic) trong một transaction.
  - **Đánh giá**: Khi thêm review, hệ thống tự động tính toán lại `avg_rating` và `review_count` của sản phẩm trong cùng một transaction.
- **Xử lý lỗi toàn cục**: Global Exception Filter giúp chuẩn hóa mọi phản hồi lỗi từ API.
- **Chuẩn hóa dữ liệu**: Response Interceptor đảm bảo mọi API trả về một cấu trúc JSON nhất quán.

## Hướng dẫn cài đặt

### 1. Clone và cài đặt thư viện
```bash
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` từ mẫu `.env.example` và điền thông tin Database của bạn:
```bash
DATABASE_URL="mysql://root:123456@localhost:3307/alexstore_db"
JWT_SECRET="your_secret_key"
JWT_EXPIRES_IN="7d"
PORT=3000
```

### 3. Khởi tạo Prisma
Vì database đã được tạo sẵn qua Workbench, bạn chỉ cần generate client:
```bash
npx prisma generate
```

### 4. Chạy ứng dụng
```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## Lưu ý quan trọng
- **Soft Delete**: Hệ thống sử dụng xóa mềm (`is_deleted`) cho User và Product để bảo toàn lịch sử dữ liệu.
- **UUID v7 Implementation**: Các trường ID trong database là `BINARY(16)`. Khi truy vấn qua Prisma, dữ liệu được truyền dưới dạng `Uint8Array`.
- **Database Logic**: Toàn bộ nghiệp vụ được xử lý ở Service, không sử dụng Trigger hay Store Procedure trong Database.

